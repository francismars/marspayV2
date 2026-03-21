import { PlayerInfoFromRole, PlayerRole } from '../types/game';

/**
 * Bracket leaf order must be Player 1 … Player N (slot index order), not alphabetical
 * by display name. The progression math (indices 2*i / 2*i+1) matches
 * `resolveTournamentFinalResult` and the client `computeBracketState`.
 */
function bracketOrderedPlayerNames(playersInfos: PlayerInfoFromRole): string[] {
  const entries = [...playersInfos.entries()].sort((a, b) => {
    const na = parseInt(String(a[0]).replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(String(b[0]).replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });
  return entries.map(([, info]) => info.name);
}

export function buildWinnerNamesList(
  playersInfos: PlayerInfoFromRole,
  winnersList: PlayerRole[]
) {
  const names: string[] = bracketOrderedPlayerNames(playersInfos);
  const winnerNames = [...names];
  winnersList.forEach((winner, i) => {
    if(winner == PlayerRole.Player1) winnerNames.push(winnerNames[2 * i])
    else winnerNames.push(winnerNames[2 * i + 1]);
  });
  return winnerNames;
}
