import { PlayerInfo, PlayerInfoFromRole, PlayerRole } from '../types/game';

/** Bracket slot order: index 0 = Player 1 role, 1 = Player 2 role, … (matches TournamentBracket `playersList`). */
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

export function parsePlayerRoleNumber(role: string): number {
  const n = parseInt(String(role).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Stable bracket order for logs/API: Player 1, Player 2, … (not Map insertion order or JSON key order). */
export function sortPlayerEntriesByBracketSlot(
  players: PlayerInfoFromRole
): [PlayerRole, PlayerInfo][] {
  return [...players.entries()].sort(
    (a, b) => parsePlayerRoleNumber(a[0]) - parsePlayerRoleNumber(b[0])
  );
}

export function getTournamentEntrantRolesSlice(
  numberOfPlayers: number
): PlayerRole[] {
  return TOURNAMENT_ENTRANT_ROLES.slice(0, numberOfPlayers);
}

/**
 * Each match records which **seat** won (`Player 1` or `Player 2` in that duel).
 * Walk the bracket using **slot order** Player 1 … Player N (same as `computeBracketState` in chain-duel-react).
 * Do not use JSON/Object.keys order — that is not bracket order.
 */
export function resolveTournamentChampionEntrantRole(
  players: PlayerInfoFromRole,
  winnersList: PlayerRole[],
  numberOfPlayers: number
): PlayerRole | undefined {
  if (!winnersList.length) {
    return undefined;
  }
  const requiredSlots = getTournamentEntrantRolesSlice(numberOfPlayers);
  if (!requiredSlots.every((r) => players.has(r))) {
    return undefined;
  }
  const leafRoles = requiredSlots;
  const round1Games = Math.max(1, Math.floor(numberOfPlayers / 2));
  const winnerEntrantRoles: PlayerRole[] = [];
  for (let i = 0; i < winnersList.length; i += 1) {
    const winnerSide = winnersList[i];
    let p1Role: PlayerRole | undefined;
    let p2Role: PlayerRole | undefined;
    if (i < round1Games) {
      p1Role = leafRoles[i * 2];
      p2Role = leafRoles[i * 2 + 1];
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
    playersInfos,
    winnersList,
    numberOfPlayers
  );
  if (!championRole) {
    return undefined;
  }
  return playersInfos.get(championRole)?.name;
}
