import type { GameState } from './types';

export type GameSeatIndex = 0 | 1 | 2 | 3;

export function clearControllerTests(_state: GameState): void {}

export function setControllerTestBySeat(
  _state: GameState,
  _seat: GameSeatIndex,
  _held: boolean
): void {}
