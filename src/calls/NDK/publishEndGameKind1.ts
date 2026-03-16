import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getOpponent } from '../../socket/game';
import { getGameInfoFromID } from '../../state/gameState';
import { getKind1sfromSessionID } from '../../state/nostrState';
import { dateNow } from '../../utils/time';
import { nip19 } from 'nostr-tools';
import { ndkInstance } from './setNDKInstance';
import { GameMode, PlayerRole } from '../../types/game';

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
  const finalResult =
    gameInfo.mode === GameMode.TOURNAMENTNOSTR
      ? resolveTournamentFinalResult(gameInfo)
      : undefined;
  const winnerRole =
    gameInfo.mode === GameMode.TOURNAMENTNOSTR
      ? finalResult?.winnerRole
      : winner;
  if (!winnerRole) {
    console.error(`${dateNow()} [${sessionID}] Unable to resolve winner role.`);
    return;
  }
  const winnerInfo = gameInfo.players.get(winnerRole);
  if (!winnerInfo) {
    console.error(`${dateNow()} [${sessionID}] Winner player info not found.`);
    return;
  }
  const winnerID = winnerInfo.id;
  const winnernprofile = winnerID ? nip19.npubEncode(winnerID) : winnerInfo.name;
  const rootKind1Info = getKind1sfromSessionID(sessionID)?.[0];
  const replyEventID = rootKind1Info?.id;
  if (!replyEventID) {
    console.error(`${dateNow()} [${sessionID}] Root event not found for final reply.`);
    return;
  }
  const kind1Info = getKind1sfromSessionID(sessionID)!.slice(-1)[0];
  const emojisGame = kind1Info.emojis;
  const winnerAmount =
    gameInfo.mode === GameMode.TOURNAMENTNOSTR
      ? [...gameInfo.players.values()].reduce((sum, player) => sum + player.value, 0)
      : winnerInfo.value;
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [['e', replyEventID, '', 'root']];
  if (winnerID) {
    ndkEvent.tags.push(['p', winnerID, '', 'mention']);
  }
  if (gameInfo.mode === GameMode.TOURNAMENTNOSTR) {
    const championMention = winnerID ? `nostr:${winnernprofile}` : winnerInfo.name;
    ndkEvent.content = `🏆 TOURNAMENT COMPLETE ${emojisGame}\nChampion: ${championMention}\nCongratulations ${winnerInfo.name}!\nFinal payout: ${Math.floor(
      winnerAmount * 0.95
    )} sats.\n\nThanks to everyone who joined - follow this thread for the next tournament.`;
  } else {
    const loser = getOpponent(winner);
    const loserID = gameInfo.players.get(loser)!.id;
    const losernprofile = loserID
      ? nip19.npubEncode(loserID)
      : gameInfo.players.get(loser)!.name;
    if (loserID) {
      ndkEvent.tags.push(['p', loserID, '', 'mention']);
    }
    ndkEvent.content = `Chain Duel P2P Game ${emojisGame} is finished.\nnostr:${winnernprofile} wins ${winnerAmount} sats!\nBetter luck next time nostr:${losernprofile}.`;
  }
  await ndkEvent.publish();
}

function resolveTournamentFinalResult(gameInfo: {
  winners?: PlayerRole[];
  players: Map<PlayerRole, { name: string; id?: string }>;
  numberOfPlayers?: number;
}) {
  if (!gameInfo.winners || gameInfo.winners.length === 0) {
    return;
  }
  const numberOfPlayers = gameInfo.numberOfPlayers ?? gameInfo.players.size;
  const entrantRoles = Object.values(PlayerRole).slice(0, numberOfPlayers);
  const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
  const winnerEntrantRoles: PlayerRole[] = [];
  for (let i = 0; i < gameInfo.winners.length; i += 1) {
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
    winnerEntrantRoles.push(winnerRole);
  }
  const winnerRole = winnerEntrantRoles[winnerEntrantRoles.length - 1];
  if (!winnerRole) {
    return;
  }
  return { winnerRole };
}
