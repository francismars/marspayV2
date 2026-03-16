import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ALLOWEDEMOJIS } from '../../consts/emojis';
import { BUYINMAX, BUYINMIN } from '../../consts/values';
import { getGameInfoFromID } from '../../state/gameState';
import { appendKind1toSessionID, getKind1sfromSessionID, setKind1IDtoSessionID } from '../../state/nostrState';
import { getOpponent } from '../../socket/game';
import { GameMode } from '../../types/game';
import { Kind1 } from '../../types/nostr';
import { dateNow } from '../../utils/time';
import { ndkInstance } from './setNDKInstance';
import { subscribeEvent } from './subscribeEvent';

interface PublishGameKind1Opts {
  hostLNAddress?: string;
  mode?: GameMode;
  buyin?: number;
  numberOfPlayers?: number;
  tournamentStatus?: 'open' | 'full' | 'round';
}

export async function publishGameKind1(sessionID: string, opts: PublishGameKind1Opts = {}) {
  if (!ndkInstance) {
    console.log('NDK not initialized');
    return;
  }
  const mode = opts.mode ?? GameMode.P2PNOSTR;
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
  const value = opts.buyin ?? (lastWinnerInfo ? lastWinnerInfo.value : BUYINMIN);
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', (value * 1000).toString()],
    ['zap-max', (BUYINMAX * 1000).toString()],
    ['zap-uses', mode === GameMode.TOURNAMENTNOSTR ? String(opts.numberOfPlayers ?? 4) : '2'],
  ];
  if (mode === GameMode.TOURNAMENTNOSTR) {
    ndkEvent.tags.push(['t', 'chainduel-tournament']);
    ndkEvent.tags.push(['t', 'chainduel-tournamentnostr']);
    ndkEvent.tags.push(['zap-uses', String(opts.numberOfPlayers ?? 4)]);
    if (opts.tournamentStatus === 'full') {
      const rootKind1Info = getKind1sfromSessionID(sessionID)?.[0];
      if (rootKind1Info) {
        ndkEvent.tags.push(['e', rootKind1Info.id, '', 'root']);
      }
      ndkEvent.content = `TOURNAMENT ${emojis} is now full.\nBracket locked.\nGames are starting now.`;
    } else if (!winnerLength) {
      ndkEvent.content = `CHAIN DUEL TOURNAMENT NOSTR MODE.\nTOURNAMENT ID: ${emojis}.\nZap ${value} sats to join.\nFirst ${opts.numberOfPlayers ?? 4} players to pay are admitted.`;
    } else {
      const rootKind1Info = getKind1sfromSessionID(sessionID)?.[0];
      if (rootKind1Info) {
        ndkEvent.tags.push(['e', rootKind1Info.id, '', 'root']);
      }
      ndkEvent.content = `TOURNAMENT UPDATE ${emojis}.\nRound ${winnerLength} results recorded.\nBracket is advancing on Chain Duel backend authority.`;
    }
  } else if (!winnerLength) {
    ndkEvent.content = `CHAIN DUEL P2P NOSTR MODE.\nGAMEID: ${emojis}.\nZap a minimum of ${value} sats to register.`;
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
  const shouldSubscribe =
    mode !== GameMode.TOURNAMENTNOSTR ||
    (mode === GameMode.TOURNAMENTNOSTR && opts.tournamentStatus !== 'full' && !winnerLength);
  const subscription = shouldSubscribe ? await subscribeEvent(9735, ndkEvent.id) : undefined;
  if (shouldSubscribe && !subscription) {
    console.log('Subscription not created');
    return;
  }
  const eventinfo: Kind1 = {
    id: ndkEvent.id,
    note1: encodedEvent,
    emojis: emojis,
    min: value,
    mode: mode,
    zapSubscription: subscription,
    hostLNAddress: opts.hostLNAddress,
    numberOfPlayers: opts.numberOfPlayers,
  };
  appendKind1toSessionID(sessionID, eventinfo);
}
