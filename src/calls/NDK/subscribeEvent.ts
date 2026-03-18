import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getKind1FromID, getSessionIDfromKind1ID } from '../../state/nostrState';
import { dateNow } from '../../utils/time';
import { getSocketFromID } from '../../state/sessionState';
import { decode } from 'light-bolt11-decoder';
import {
  getGameInfoFromID,
  serializeGameInfoFromID,
  setGameInfoByID,
} from '../../state/gameState';
import { BUYINMIN } from '../../consts/values';
import { io } from '../../server';
import {
  GameInfo,
  GameMode,
  Payment,
  PlayerInfo,
  PlayerRole,
} from '../../types/game';
import { ndkInstance } from '../../calls/NDK/setNDKInstance';
import {
  consumePin,
  getRoomBySession,
  seatPaidPlayer,
  serializeRoom,
} from '../../state/onlineRoomState';

const processedZapEventIDs = new Set<string>();

export async function subscribeEvent(eventType: number, eventID: string) {
  if (!ndkInstance) {
    console.log('NDK not initialized');
    return;
  }
  const subscription = ndkInstance.subscribe({
    kinds: [eventType],
    '#e': [eventID],
  });
  subscription.on('event', async (event: NDKEvent) => {
    listenToSubscriptions(event);
  });
  return subscription;
}

async function listenToSubscriptions(event: NDKEvent) {
  if (processedZapEventIDs.has(event.id)) {
    return;
  }
  processedZapEventIDs.add(event.id);

  const eventID = event.tags.find((tag) => tag[0] == 'e');
  if (!eventID || !eventID[1]) {
    console.log('Event ID not found');
    return;
  }
  const sessionID = getSessionIDfromKind1ID(eventID[1]);
  if (!sessionID) {
    console.log(`Couldn't find Session ID from event ID`);
    return;
  }
  console.log(`${dateNow()} [${sessionID}] Event ${eventID[1]} was Zapped.`);
  const eventdescription = event.tags.find((tag) => tag[0] == 'description');
  if (!eventdescription || !eventdescription[1]) {
    console.log('Event description not found');
    return;
  }
  const socketID = getSocketFromID(sessionID)?.socketID;
  if (!socketID) {
    console.error("Couldn't find SocketID to send notification of payment");
    return;
  }
  const descriptionParsed = JSON.parse(eventdescription[1]);
  const tagsDescriptionContent = descriptionParsed.content;
  const eventContent = event.content;
  const finalContent =
    eventContent != undefined && eventContent != ''
      ? eventContent
      : tagsDescriptionContent;
  const amountFromDescription = descriptionParsed.tags.find(
    (tag: string[]) => tag[0] == 'amount'
  );
  const eventBolt11 = event.tags.find((tag) => tag[0] == 'bolt11');
  const bolt11Amount =
    eventBolt11 && eventBolt11[1]
      ? decode(eventBolt11[1]).sections.find(
          (section) => section.name == 'amount'
        )
      : null;
  const zapAmount =
    amountFromDescription && amountFromDescription[1]
      ? Math.floor(parseInt(amountFromDescription[1]) / 1000)
      : bolt11Amount
      ? Math.floor(parseInt(bolt11Amount.value) / 1000)
      : 0;
  const payerPubKey = descriptionParsed.pubkey as string | undefined;
  const userZap = payerPubKey ? ndkInstance.getUser({ pubkey: payerPubKey }) : undefined;
  if (userZap) {
    await userZap.fetchProfile();
  }
  const kind1 = getKind1FromID(eventID[1]);
  const kind1Mode = kind1?.mode as GameMode | undefined;
  const gameMode = kind1Mode ?? GameMode.P2PNOSTR;
  const minBuyIn = kind1?.min ?? BUYINMIN;
  const maxPlayers =
    gameMode === GameMode.TOURNAMENTNOSTR ? kind1?.numberOfPlayers ?? 4 : 2;
  const isAnon = !payerPubKey;
  const anonSuffix = event.id.slice(0, 6);
  const npubLike = payerPubKey ? `${payerPubKey.slice(0, 8)}...${payerPubKey.slice(-4)}` : '';
  const fallbackLabel = isAnon ? `Anon #${anonSuffix}` : `npub:${npubLike}`;
  const zapperName =
    userZap?.profile?.displayName ??
    userZap?.profile?.name ??
    descriptionParsed.content ??
    fallbackLabel;
  const avatar =
    userZap?.profile?.image ??
    userZap?.profile?.picture ??
    '/images/loading.gif';
  if (gameMode === GameMode.ONLINE) {
    const room = getRoomBySession(sessionID);
    if (!room) {
      console.log(`${dateNow()} [${sessionID}] [ONLINE] zap ignored: no room for session`);
      return;
    }
    console.log(
      `${dateNow()} [${sessionID}] [ONLINE] zap received roomId=${room.roomId} amount=${zapAmount} sender=${zapperName}`
    );
    if (zapAmount < minBuyIn) {
      console.log(
        `${dateNow()} [${sessionID}] [ONLINE] zap rejected roomId=${room.roomId} reason=amount_too_low min=${minBuyIn} got=${zapAmount}`
      );
      io.to(socketID).emit('onlinePinInvalid', { reason: 'amount_too_low' });
      return;
    }
    const pin = extractPinFromComment(finalContent);
    if (!pin) {
      console.log(`${dateNow()} [${sessionID}] [ONLINE] zap rejected roomId=${room.roomId} reason=pin_missing`);
      io.to(socketID).emit('onlinePinInvalid', { reason: 'pin_missing' });
      return;
    }
    console.log(`${dateNow()} [${sessionID}] [ONLINE] zap pin parsed roomId=${room.roomId} pin=${pin}`);
    const consumed = consumePin(pin, room.roomId);
    if (!consumed.ok) {
      console.log(
        `${dateNow()} [${sessionID}] [ONLINE] zap rejected roomId=${room.roomId} reason=${consumed.reason}`
      );
      io.to(socketID).emit('onlinePinInvalid', { reason: consumed.reason });
      return;
    }
    const seatResult = seatPaidPlayer({
      roomId: room.roomId,
      sessionID: consumed.record.sessionID,
      socketID: consumed.record.socketID,
      amount: zapAmount,
      name: zapperName,
      picture: avatar,
      pubkey: payerPubKey,
    });
    if (!seatResult.ok) {
      console.log(
        `${dateNow()} [${sessionID}] [ONLINE] seat assignment failed roomId=${room.roomId} reason=${seatResult.reason}`
      );
      io.to(consumed.record.socketID).emit('onlinePinInvalid', {
        reason: seatResult.reason,
      });
      return;
    }
    console.log(
      `${dateNow()} [${sessionID}] [ONLINE] seat assigned roomId=${room.roomId} role=${seatResult.role} session=${consumed.record.sessionID}`
    );
    io.to(room.roomId).emit('onlineSeatAssigned', {
      roomId: room.roomId,
      playerRole: seatResult.role,
      sessionId: consumed.record.sessionID,
    });
    io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(seatResult.room));
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Zap of ${zapAmount} sats sent by ${zapperName}.`
  );
  const gameInfo = getGameInfoFromID(sessionID);
  const zapperPrevRole = gameInfo
    ? [...gameInfo.players].find(
        ([, playerInfo]) => !!payerPubKey && playerInfo.id === payerPubKey
      )?.[0]
    : undefined;
  if (zapAmount < minBuyIn && !zapperPrevRole) {
    console.log(
      `${dateNow()} [${sessionID}] Zap amount ${zapAmount} is less than minimum ${minBuyIn}.`
    );
    const resZap = {
      amount: zapAmount,
      content: finalContent,
      username: zapperName,
      profile: avatar,
    };
    io.to(socketID).emit('zapReceived', resZap);
    return;
  }
  const currentPlayersSize = getGameInfoFromID(sessionID)?.players?.size ?? 0;
  if (!zapperPrevRole && currentPlayersSize >= maxPlayers) {
    console.log(
      `${dateNow()} [${sessionID}] Game already has the max number of players: ${maxPlayers}.`
    );
    return;
  }
  const payment: Payment = {
    amount: zapAmount,
  };
  const prevValue = zapperPrevRole
    ? gameInfo!.players.get(zapperPrevRole)!.value
    : 0;
  const prevPayments = zapperPrevRole
    ? gameInfo!.players.get(zapperPrevRole)!.payments!
    : [];
  prevPayments.push(payment);
  const playerInfo: PlayerInfo = {
    name: zapperName,
    value: zapAmount + prevValue,
    payments: prevPayments,
    picture: avatar,
    id: payerPubKey,
    participantId: payerPubKey ?? `anon-${anonSuffix}`,
    isAnon: isAnon,
    nostrPubkey: payerPubKey,
    fallbackLabel,
  };
  const playersMap = new Map<PlayerRole, PlayerInfo>();
  const playerRole = zapperPrevRole ?? getNextAvailableRole(sessionID, maxPlayers);
  if (!playerRole) {
    console.log(`${dateNow()} [${sessionID}] No available role for incoming zap.`);
    return;
  }
  playersMap.set(playerRole, playerInfo);
  const previousInfo = getGameInfoFromID(sessionID);
  const previousPlayersCount = previousInfo?.players.size ?? 0;
  const modeToPersist = previousInfo?.mode ?? gameMode;
  const numberOfPlayers =
    previousInfo?.numberOfPlayers ??
    (modeToPersist === GameMode.TOURNAMENTNOSTR ? maxPlayers : undefined);
  const newGameInfo: GameInfo = {
    mode: modeToPersist,
    players: playersMap,
    numberOfPlayers,
  };
  setGameInfoByID(sessionID, newGameInfo);
  const currentPlayersCount = getGameInfoFromID(sessionID)?.players.size ?? 0;
  if (
    modeToPersist === GameMode.TOURNAMENTNOSTR &&
    previousPlayersCount < maxPlayers &&
    currentPlayersCount >= maxPlayers
  ) {
    void import('./publishGameKind1').then(({ publishGameKind1 }) =>
      publishGameKind1(sessionID, {
        mode: GameMode.TOURNAMENTNOSTR,
        buyin: minBuyIn,
        numberOfPlayers: maxPlayers,
        tournamentStatus: 'full',
      })
    );
  }
  const serialized = serializeGameInfoFromID(sessionID);
  if (modeToPersist === GameMode.TOURNAMENTNOSTR) {
    io.to(socketID).emit('updatePaymentsNostrTournament', serialized);
  }
  io.to(socketID).emit('updatePayments', serialized);
}

function extractPinFromComment(content: string | undefined) {
  if (!content) {
    return;
  }
  const compact = content.trim().toUpperCase();
  if (/^[A-Z0-9]{4,10}$/.test(compact)) {
    return compact;
  }
  const matched = compact.match(/([A-Z0-9]{4,10})/);
  return matched?.[1];
}

function getNextAvailableRole(sessionID: string, maxPlayers: number): PlayerRole | undefined {
  const gameInfo = getGameInfoFromID(sessionID);
  const assignedRoles = gameInfo ? [...gameInfo.players.keys()] : [];
  const allRoles = Object.values(PlayerRole).slice(0, maxPlayers);
  const availableRoles = allRoles.filter(
    (role) => !assignedRoles.includes(role as PlayerRole)
  );
  if (availableRoles.length === 0) {
    return;
  }
  const randomIdx = Math.floor(Math.random() * availableRoles.length);
  return availableRoles[randomIdx] as PlayerRole | undefined;
}
