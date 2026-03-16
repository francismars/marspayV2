import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ALLOWEDEMOJIS } from '../../consts/emojis';
import { BUYINMAX, BUYINMIN } from '../../consts/values';
import { getGameInfoFromID } from '../../state/gameState';
import { appendKind1toSessionID, getKind1sfromSessionID, setKind1IDtoSessionID } from '../../state/nostrState';
import { getOpponent } from '../../socket/game';
import { GameInfo, GameMode, PlayerRole } from '../../types/game';
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
  const tournamentFixedZap = mode === GameMode.TOURNAMENTNOSTR ? value : BUYINMAX;
  const isTournamentNostrReply =
    mode === GameMode.TOURNAMENTNOSTR &&
    (opts.tournamentStatus === 'full' || !!winnerLength);
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = isTournamentNostrReply
    ? []
    : [
        ['t', 'pubpay'],
        ['zap-min', (value * 1000).toString()],
        ['zap-max', (tournamentFixedZap * 1000).toString()],
        [
          'zap-uses',
          mode === GameMode.TOURNAMENTNOSTR
            ? String(opts.numberOfPlayers ?? 4)
            : '2',
        ],
      ];
  if (mode === GameMode.TOURNAMENTNOSTR) {
    if (opts.tournamentStatus === 'full') {
      const rootKind1Info = getKind1sfromSessionID(sessionID)?.[0];
      if (rootKind1Info) {
        ndkEvent.tags.push(['e', rootKind1Info.id, '', 'root']);
      }
      const roster = getTournamentRegisteredPlayers(gameInfo);
      for (const player of roster) {
        if (player.pubkey) {
          ndkEvent.tags.push(['p', player.pubkey, '', 'mention']);
        }
      }
      const rosterLines = roster
        .map((player, idx) => {
          const mention = player.pubkey
            ? `nostr:${nip19.npubEncode(player.pubkey)}`
            : player.name;
          return `${idx + 1}. ${mention}`;
        })
        .join('\n');
      ndkEvent.content = `TOURNAMENT ${emojis} is now full.\nBracket locked.\nRegistered players:\n${rosterLines}\nGames are starting now.`;
    } else if (!winnerLength) {
      ndkEvent.content = `CHAIN DUEL TOURNAMENT NOSTR MODE.\nTOURNAMENT ID: ${emojis}.\nZap ${value} sats to join.\nFirst ${opts.numberOfPlayers ?? 4} players to pay are admitted.`;
    } else {
      const rootKind1Info = getKind1sfromSessionID(sessionID)?.[0];
      if (rootKind1Info) {
        ndkEvent.tags.push(['e', rootKind1Info.id, '', 'root']);
      }
      const result = resolveTournamentMatchResult(gameInfo, winnerLength - 1);
      if (result?.winnerPubkey) {
        ndkEvent.tags.push(['p', result.winnerPubkey, '', 'mention']);
      }
      if (result?.loserPubkey) {
        ndkEvent.tags.push(['p', result.loserPubkey, '', 'mention']);
      }
      const winnerMention = result?.winnerPubkey
        ? `nostr:${nip19.npubEncode(result.winnerPubkey)}`
        : result?.winnerName ?? 'Unknown winner';
      const loserMention = result?.loserPubkey
        ? `nostr:${nip19.npubEncode(result.loserPubkey)}`
        : result?.loserName ?? 'Unknown loser';
      ndkEvent.content = `TOURNAMENT UPDATE ${emojis}.\nGame ${winnerLength} result: ${winnerMention} defeated ${loserMention}.\n${winnerMention} advances to the next round.\nFollow this thread for the next matchup and final champion.`;
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

function getTournamentRegisteredPlayers(gameInfo?: GameInfo) {
  if (!gameInfo) {
    return [] as Array<{ role: PlayerRole; name: string; pubkey?: string }>;
  }
  return [...gameInfo.players.entries()]
    .sort((a, b) => {
      const aNum = Number.parseInt(a[0].replace('Player ', ''), 10);
      const bNum = Number.parseInt(b[0].replace('Player ', ''), 10);
      return aNum - bNum;
    })
    .map(([role, info]) => ({
      role,
      name: info.name || role,
      pubkey: info.id,
    }));
}

function resolveTournamentMatchResult(gameInfo: GameInfo | undefined, gameIndex: number) {
  if (!gameInfo?.winners || gameIndex < 0 || gameIndex >= gameInfo.winners.length) {
    return;
  }
  const numberOfPlayers = gameInfo.numberOfPlayers ?? gameInfo.players.size;
  const entrantRoles = Object.values(PlayerRole).slice(0, numberOfPlayers);
  const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
  const winnerEntrantRoles: PlayerRole[] = [];
  for (let i = 0; i <= gameIndex; i += 1) {
    const winnerSide = gameInfo.winners[i];
    let p1Role: PlayerRole | undefined;
    let p2Role: PlayerRole | undefined;
    if (i < round1Games) {
      p1Role = entrantRoles[i * 2] as PlayerRole | undefined;
      p2Role = entrantRoles[i * 2 + 1] as PlayerRole | undefined;
    } else {
      const p1i = (i - round1Games) * 2;
      p1Role = winnerEntrantRoles[p1i];
      p2Role = winnerEntrantRoles[p1i + 1];
    }
    if (!p1Role || !p2Role) {
      return;
    }
    const winnerRole = winnerSide === PlayerRole.Player1 ? p1Role : p2Role;
    const loserRole = winnerSide === PlayerRole.Player1 ? p2Role : p1Role;
    winnerEntrantRoles.push(winnerRole);
    if (i === gameIndex) {
      const winnerInfo = gameInfo.players.get(winnerRole);
      const loserInfo = gameInfo.players.get(loserRole);
      return {
        winnerRole,
        loserRole,
        winnerName: winnerInfo?.name ?? winnerRole,
        loserName: loserInfo?.name ?? loserRole,
        winnerPubkey: winnerInfo?.id,
        loserPubkey: loserInfo?.id,
      };
    }
  }
  return;
}
