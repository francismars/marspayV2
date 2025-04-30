import { PlayerInfoFromRole, PlayerRole } from '../types/game';

export function buildWinnerNamesList(
  playersInfos: PlayerInfoFromRole,
  winnersList: PlayerRole[]
) {
  const names: string[] = Array.from(playersInfos.values())
    .sort()
    .map((info) => info.name);
  const winnerNames = [...names];
  winnersList.forEach((winner, i) => {
    if(winner == PlayerRole.Player1) winnerNames.push(winnerNames[2 * i])
    else winnerNames.push(winnerNames[2 * i + 1]);
  });
  return winnerNames;
}
