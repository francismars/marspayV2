import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getSessionIDfromKind1ID } from '../../state/nostrState';
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
  const payerPubKey = descriptionParsed.pubkey;
  const userZap = ndkInstance.getUser({ pubkey: payerPubKey });
  await userZap.fetchProfile();
  if (!userZap.profile) {
    console.log('Zapper user profile not found');
    return;
  }
  const zapperName = userZap.profile.name ?? 'Zapper';
  console.log(
    `${dateNow()} [${sessionID}] Zap of ${zapAmount} sats sent by ${zapperName}.`
  );
  const gameInfo = getGameInfoFromID(sessionID);
  const zapperPrevRole = gameInfo
    ? [...gameInfo.players].find(
        ([playerRole, playerInfo]) => playerInfo.id === payerPubKey
      )?.[0]
    : undefined;
  if (zapAmount < BUYINMIN && !zapperPrevRole) {
    console.log(
      `${dateNow()} [${sessionID}] Zap amount ${zapAmount} is less than minimum ${BUYINMIN}.`
    );
    const resZap = {
      amount: zapAmount,
      content: finalContent,
      username: zapperName,
      profile: userZap.profile.picture,
    };
    io.to(socketID).emit('zapReceived', resZap);
    return;
  }
  const numberOfPlayers = getGameInfoFromID(sessionID)?.players?.size;
  if (!!zapperPrevRole && numberOfPlayers && numberOfPlayers > 2) {
    console.log(`${dateNow()} [${sessionID}] Game already has 2 players.`);
    return;
  }
  const payment: Payment = {
    amount: zapAmount,
    payerPubKey: payerPubKey,
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
    picture: userZap.profile.picture,
    id: payerPubKey,
  };
  const newPlayerInfo = new Map<PlayerRole, PlayerInfo>();
  const playerRole = zapperPrevRole
    ? zapperPrevRole
    : !numberOfPlayers
    ? PlayerRole.Player1
    : PlayerRole.Player2;
  newPlayerInfo.set(playerRole, playerInfo);
  const gameMode = GameMode.P2PNOSTR;
  const newGameInfo: GameInfo = {
    mode: gameMode,
    players: newPlayerInfo,
  };
  setGameInfoByID(sessionID, newGameInfo);
  io.to(socketID).emit('updatePayments', serializeGameInfoFromID(sessionID));
}
