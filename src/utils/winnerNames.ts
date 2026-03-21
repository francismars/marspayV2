import { PlayerInfoFromRole, PlayerRole } from '../types/game';

/** Bracket slot order: Player 1 … Player N (same as client `computeBracketState`). */
const TOURNAMENT_ENTRANT_ROLES: PlayerRole[] = [
  PlayerRole.Player1,
  PlayerRole.Player2,
  PlayerRole.Player3,
  PlayerRole.Player4,
  PlayerRole.Player5,
  PlayerRole.Player6,
  PlayerRole.Player7,
  PlayerRole.Player8,
  PlayerRole.Player9,
  PlayerRole.Player10,
  PlayerRole.Player11,
  PlayerRole.Player12,
  PlayerRole.Player13,
  PlayerRole.Player14,
  PlayerRole.Player15,
  PlayerRole.Player16,
];

export function getTournamentEntrantRolesSlice(
  numberOfPlayers: number
): PlayerRole[] {
  return TOURNAMENT_ENTRANT_ROLES.slice(0, numberOfPlayers);
}

/**
 * Each match records which **seat** won (`Player 1` or `Player 2` in that duel).
 * Walk the bracket to find which **entrant** (Player 1 … Player N) is champion.
 * Must match client `computeBracketState` and publishGameKind1 `resolveTournamentMatchResult`.
 */
export function resolveTournamentChampionEntrantRole(
  winnersList: PlayerRole[],
  numberOfPlayers: number
): PlayerRole | undefined {
  if (!winnersList.length) {
    return undefined;
  }
  const entrantRoles = getTournamentEntrantRolesSlice(numberOfPlayers);
  const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
  const winnerEntrantRoles: PlayerRole[] = [];
  for (let i = 0; i < winnersList.length; i += 1) {
    const winnerSide = winnersList[i];
    let p1Role: PlayerRole | undefined;
    let p2Role: PlayerRole | undefined;
    if (i < round1Games) {
      p1Role = entrantRoles[i * 2];
      p2Role = entrantRoles[i * 2 + 1];
    } else {
      const p1i = (i - round1Games) * 2;
      p1Role = winnerEntrantRoles[p1i];
      p2Role = winnerEntrantRoles[p1i + 1];
    }
    if (!p1Role || !p2Role) {
      return undefined;
    }
    const winnerRole =
      winnerSide === PlayerRole.Player1 ? p1Role : p2Role;
    winnerEntrantRoles.push(winnerRole);
  }
  return winnerEntrantRoles[winnerEntrantRoles.length - 1];
}

export function resolveChampionDisplayNameFromTournamentWinners(
  playersInfos: PlayerInfoFromRole,
  winnersList: PlayerRole[],
  numberOfPlayers: number
): string | undefined {
  const championRole = resolveTournamentChampionEntrantRole(
    winnersList,
    numberOfPlayers
  );
  if (!championRole) {
    return undefined;
  }
  return playersInfos.get(championRole)?.name;
}
