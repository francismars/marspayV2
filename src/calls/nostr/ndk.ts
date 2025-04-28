import NDK, {
  NDKEvent,
  NDKPrivateKeySigner,
  NDKSubscription,
} from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { decode } from 'light-bolt11-decoder';
import { relaysNostr } from '../../consts/nostrRelays';
import dotenv from 'dotenv';
import { BUYINMAX, BUYINMIN } from '../../consts/values';
import {
  getKind1sfromSessionID,
  getSessionIDfromKind1ID,
} from '../../state/nostrState';
import {
  getGameInfoFromID,
  getSerializedIDToGameInfo,
  serializeGameInfoFromID,
  setGameInfoByID,
} from '../../state/gameState';
import {
  GameInfo,
  GameMode,
  Payment,
  PlayerInfo,
  PlayerRole,
} from '../../types/game';
import { io } from '../../server';
import { getSocketFromID } from '../../state/sessionState';
import { dateNow } from '../../utils/time';
import { getOpponent } from '../../socket/game';

let ndk: NDK;
let subscriptions: NDKSubscription;

export async function setNDKInstance() {
  if (!ndk) {
    dotenv.config();
    const nostrPrivKey = process.env.NOSTR_PK;
    const pksigner = new NDKPrivateKeySigner(nostrPrivKey!);
    ndk = new NDK({
      signer: pksigner,
      explicitRelayUrls: relaysNostr,
    });
    let connectedRelays = 0;
    const relayConnected = new Promise<void>((resolve) => {
      ndk.pool.on('relay:connect', () => {
        connectedRelays++;
        if (connectedRelays > relaysNostr.length / 2) {
          resolve();
        }
      });
    });
    await ndk.connect();
    await relayConnected;
  }
}

export async function createAndPublishKind1(value: number, emojis: string) {
  if (!ndk) {
    console.log('NDK not initialized');
    return;
  }
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = 1;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', (value * 1000).toString()],
    ['zap-max', BUYINMAX.toString()],
    ['zap-uses', '2'],
  ];
  ndkEvent.content = `DISREGARD: TESTING CHAIN DUEL NOSTR MODE ${emojis}\n Zap a minimum of ${value} sats to register.`;
  try {
    await ndkEvent.publish();
  } catch (error) {
    console.log("couldn't publish:", error);
  }
  return ndkEvent.id;
}

export async function subscribeEvent(eventType: number, eventID: string) {
  if (!ndk) {
    console.log('NDK not initialized');
    return;
  }
  subscriptions = ndk.subscribe({ kinds: [eventType], '#e': [eventID] });
  listenToSubscriptions();
}

async function listenToSubscriptions() {
  subscriptions.on('event', async (event) => {
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
    console.log(`${dateNow()} [${sessionID}] Event ${eventID} was Zapped.`);
    const eventdescription = event.tags.find((tag) => tag[0] == 'description');
    if (!eventdescription || !eventdescription[1]) {
      console.log('Event description not found');
      return;
    }
    const socketID = getSocketFromID(sessionID);
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
    const userZap = ndk.getUser({ pubkey: payerPubKey });
    await userZap.fetchProfile();
    if (!userZap.profile) {
      console.log('Zapper user profile not found');
      return;
    }
    const zapperName = userZap.profile.name ?? 'Zapper';
    console.log(
      `${dateNow()} [${sessionID}] Zap of ${zapAmount} sats sent by ${zapperName}.`
    );
    if (zapAmount < BUYINMIN) {
      console.log(
        `${dateNow()} [${sessionID}] Zap amount ${zapAmount} is less than minimum ${BUYINMIN}.`
      );
      let resZap = {
        amount: zapAmount,
        content: finalContent,
        username: zapperName,
        profile: userZap.profile.picture,
      };
      io.to(socketID).emit('zapReceived', resZap);
      return;
    }
    const payment: Payment = {
      amount: zapAmount,
      payerPubKey: payerPubKey,
    };
    const playerInfo: PlayerInfo = {
      name: zapperName,
      value: zapAmount,
      payments: [payment],
      picture: userZap.profile.picture,
      id: payerPubKey,
    };
    const newPlayerInfo = new Map<PlayerRole, PlayerInfo>();
    const playerRole = !getGameInfoFromID(sessionID)?.players
      ? PlayerRole.Player1
      : PlayerRole.Player2;
    newPlayerInfo.set(playerRole, playerInfo);
    const gameMode = GameMode.P2PNOSTR;
    const gameInfo: GameInfo = {
      mode: gameMode,
      players: newPlayerInfo,
    };
    setGameInfoByID(sessionID, gameInfo);
    io.to(socketID).emit('updatePayments', serializeGameInfoFromID(sessionID));
  });
}

export async function publishEndGameKind1(sessionID: string) {
  const gameInfo = getGameInfoFromID(sessionID);
  if (!gameInfo) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    return;
  }
  const winner = gameInfo.winners?.slice(-1)[0];
  if (!winner) {
    console.error(`${dateNow()} [${sessionID}] Winner not found.`);
    return;
  }
  const winnerID = gameInfo.players.get(winner)!.id;
  const winnernprofile = nip19.npubEncode(winnerID!);
  const kind1Info = getKind1sfromSessionID(sessionID)![0];
  const loser = getOpponent(winner);
  const loserID = gameInfo.players.get(loser)!.id;
  const losernprofile = nip19.npubEncode(loserID!);
  const replyEventID = kind1Info.id;
  const emojisGame = kind1Info.emojis;
  const winnerAmount = gameInfo.players.get(winner)!.value;
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = 1;
  ndkEvent.tags = [['e', replyEventID, '', 'root']];
  ndkEvent.tags.push(['p', winnerID!, '', 'mention']);
  ndkEvent.tags.push(['p', loserID!, '', 'mention']);
  ndkEvent.content = `Chain Duel P2P Game ${emojisGame} is finished.\n ${winnernprofile} wins ${winnerAmount} sats!\n Better luck next time ${losernprofile}.\n`;
  await ndkEvent.publish();
}
