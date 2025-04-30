import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ALLOWEDEMOJIS } from '../../consts/emojis';
import { getGameInfoFromID } from '../../state/gameState';
import {
  appendKind1toSessionID,
  getKind1sfromSessionID,
  setKind1IDtoSessionID,
} from '../../state/nostrState';
import { BUYINMAX, BUYINMIN } from '../../consts/values';
import { getOpponent } from '../../socket/game';
import { nip19 } from 'nostr-tools';
import { dateNow } from '../../utils/time';
import { Kind1 } from '../../types/nostr';
import { GameMode } from '../../types/game';
import { ndkInstance } from './setNDKInstance';
import { subscribeEvent } from './subscribeEvent';

export async function publishGameKind1(sessionID: string) {
  if (!ndkInstance) {
    console.log('NDK not initialized');
    return;
  }
  const kind1Info = getKind1sfromSessionID(sessionID)?.slice(-1)[0];
  const gameInfo = getGameInfoFromID(sessionID);
  const winnerLength = gameInfo?.winners?.length;
  const lastWinnerRole = gameInfo?.winners?.slice(-1)[0];
  const lastWinnerInfo = lastWinnerRole
    ? gameInfo?.players.get(lastWinnerRole)
    : undefined;
  const emojis = kind1Info
    ? kind1Info.emojis
    : [...Array(4)]
        .map(() => ALLOWEDEMOJIS[(Math.random() * ALLOWEDEMOJIS.length) | 0])
        .join('');
  const value = lastWinnerInfo ? lastWinnerInfo.value : BUYINMIN;
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', (value * 1000).toString()],
    ['zap-max', (BUYINMAX * 1000).toString()],
    ['zap-uses', '2'],
  ];
  if (!winnerLength) {
    ndkEvent.content = `DISREGARD: CHAIN DUEL NOSTR MODE.\nGAMEID: ${emojis}.\nZap a minimum of ${value} sats to register.`;
  } else {
    const winnerID = lastWinnerInfo!.id;
    const winnernprofile = nip19.npubEncode(winnerID!);
    const kind1Info = getKind1sfromSessionID(sessionID)!.slice(-1)[0];
    const loser = getOpponent(lastWinnerRole!);
    const loserID = gameInfo.players.get(loser)!.id;
    const losernprofile = nip19.npubEncode(loserID!);
    ndkEvent.tags.push(['e', kind1Info.id, '', 'root']);
    ndkEvent.tags.push(['p', winnerID!, '', 'mention']);
    ndkEvent.tags.push(['p', loserID!, '', 'mention']);
    ndkEvent.content = `Game ${winnerLength} finished! nostr:${winnernprofile} in the winner!\nnostr:${losernprofile} challenged to a Double or Nothing x${
      2 ** winnerLength
    }.\nGAMEID: ${emojis}.\nAwaiting nostr:${losernprofile} to zap a minimum of ${value} sats to register.`;
  }
  try {
    await ndkEvent.publish();
  } catch (error) {
    console.log(
      `${dateNow()} [${sessionID}] Unable to publish Game event on Nostr: ${error}`
    );
    return;
  }
  setKind1IDtoSessionID(ndkEvent.id, sessionID);
  const encodedEvent = nip19.noteEncode(ndkEvent.id);
  console.log(
    `${dateNow()} [${sessionID}] Created Nostr Event ${encodedEvent}.`
  );
  const subscription = await subscribeEvent(9735, ndkEvent.id);
  if (!subscription) {
    console.log('Subscription not created');
    return;
  }
  const eventinfo: Kind1 = {
    id: ndkEvent.id,
    note1: encodedEvent,
    emojis: emojis,
    min: value,
    mode: GameMode.P2PNOSTR,
    zapSubscription: subscription,
  };
  appendKind1toSessionID(sessionID, eventinfo);
}
