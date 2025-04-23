import { PlayerInfo, PlayerInfoFromRole, PlayerRole } from '../types/game';

export function buildWinnerNamesList(
  playersInfos: PlayerInfoFromRole,
  winnersList: PlayerRole[]
) {
  const names: string[] = Array.from(playersInfos.values())
    .sort()
    .map((info) => info.name);
  const namesCopy = [...names];
  winnersList.forEach((winner, i) => {
    winner == 'Player 1'
      ? namesCopy.push(namesCopy[2 * i])
      : namesCopy.push(namesCopy[2 * i + 1]);
  });
  return namesCopy;
}
