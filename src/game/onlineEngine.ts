export type Direction = 'Up' | 'Down' | 'Left' | 'Right' | '';
export type PlayerId = 'P1' | 'P2';
export type GridPos = [number, number];

export interface SnakeState {
  head: GridPos;
  body: GridPos[];
  dir: Direction;
  dirWanted: Direction;
}

export interface Coinbase {
  pos: GridPos;
  reward?: 2 | 4 | 8 | 16 | 32;
}

export interface PointChange {
  player: PlayerId;
  value: number;
  p1Pos: GridPos;
  p2Pos: GridPos;
  p1YOffsetPx: number;
  p2YOffsetPx: number;
  alpha: number;
}

export interface OnlineAuthoritativeState {
  cols: number;
  rows: number;
  p1: SnakeState;
  p2: SnakeState;
  coinbases: Coinbase[];
  gameStarted: boolean;
  gameEnded: boolean;
  countdownStart: boolean;
  countdownTicks: number;
  winnerPlayer: PlayerId | null;
  winnerName: string;
  sentWinner: boolean;
  initialScore: [number, number];
  score: [number, number];
  totalPoints: number;
  currentCaptureP1: string;
  currentCaptureP2: string;
  pointChanges: PointChange[];
  p1Name: string;
  p2Name: string;
  meta: {
    modeLabel: string;
    isTournament: boolean;
    practiceMode: boolean;
  };
}

export interface OnlineHudState {
  p1Points: number;
  p2Points: number;
  captureP1: string;
  captureP2: string;
  initialWidthP1: number;
  initialWidthP2: number;
  currentWidthP1: number;
  currentWidthP2: number;
}

const GAME_COLS = 51;
const GAME_ROWS = 25;
const COUNTDOWN_END_TICK = 40;
const CAPTURE_LEVELS = [
  { minLength: 1, maxLength: 1, percent: 2 },
  { minLength: 2, maxLength: 3, percent: 4 },
  { minLength: 4, maxLength: 6, percent: 8 },
  { minLength: 7, maxLength: 10, percent: 16 },
  { minLength: 11, maxLength: Number.POSITIVE_INFINITY, percent: 32 },
] as const;

export function createOnlineGameState(args: {
  p1Name: string;
  p2Name: string;
  p1Points: number;
  p2Points: number;
}): OnlineAuthoritativeState {
  const p1 = Math.max(1, Math.floor(args.p1Points));
  const p2 = Math.max(1, Math.floor(args.p2Points));
  return {
    cols: GAME_COLS,
    rows: GAME_ROWS,
    p1: { head: [6, 12], body: [[5, 12]], dir: '', dirWanted: 'Right' },
    p2: { head: [44, 12], body: [[45, 12]], dir: '', dirWanted: 'Left' },
    coinbases: [{ pos: [25, 12] }],
    gameStarted: false,
    gameEnded: false,
    countdownStart: false,
    countdownTicks: 0,
    winnerPlayer: null,
    winnerName: '',
    sentWinner: false,
    initialScore: [p1, p2],
    score: [p1, p2],
    totalPoints: p1 + p2,
    currentCaptureP1: '2%',
    currentCaptureP2: '2%',
    pointChanges: [],
    p1Name: args.p1Name,
    p2Name: args.p2Name,
    meta: {
      modeLabel: 'ONLINE',
      isTournament: false,
      practiceMode: false,
    },
  };
}

export function getOnlineHudState(state: OnlineAuthoritativeState): OnlineHudState {
  const initialWidthP1 = (state.initialScore[0] * 100) / state.totalPoints;
  const initialWidthP2 = (state.initialScore[1] * 100) / state.totalPoints;
  const currentWidthP1 = (state.score[0] * 100) / state.totalPoints;
  const currentWidthP2 = (state.score[1] * 100) / state.totalPoints;
  return {
    p1Points: state.score[0],
    p2Points: state.score[1],
    captureP1: getCaptureLabel(state.p1.body.length),
    captureP2: getCaptureLabel(state.p2.body.length),
    initialWidthP1,
    initialWidthP2,
    currentWidthP1,
    currentWidthP2,
  };
}

export function startOnlineCountdown(state: OnlineAuthoritativeState): void {
  if (!state.gameStarted) {
    state.countdownStart = true;
  }
}

export function setOnlineWantedDirection(
  state: OnlineAuthoritativeState,
  player: PlayerId,
  dir: Exclude<Direction, ''>
): void {
  const snake = player === 'P1' ? state.p1 : state.p2;
  if (!state.gameStarted) {
    if (player === 'P1' && dir === 'Right') snake.dirWanted = dir;
    if (player === 'P2' && dir === 'Left') snake.dirWanted = dir;
    return;
  }
  if (player === 'P1') {
    if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Left';
    if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) {
      snake.dirWanted = 'Right';
    }
    if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
    if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
    return;
  }
  if (dir === 'Left' && (snake.dir === 'Up' || snake.dir === 'Down' || snake.dir === '')) {
    snake.dirWanted = 'Left';
  }
  if (dir === 'Right' && (snake.dir === 'Up' || snake.dir === 'Down')) snake.dirWanted = 'Right';
  if (dir === 'Up' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Up';
  if (dir === 'Down' && (snake.dir === 'Left' || snake.dir === 'Right')) snake.dirWanted = 'Down';
}

export function stepOnlineGame(state: OnlineAuthoritativeState): void {
  if (state.gameStarted && !state.gameEnded) {
    movePlayers(state);
    checkCollisions(state);
    captureCoinbase(state);
    if (state.score[0] <= 0 || state.score[1] <= 0) {
      state.gameEnded = true;
      if (state.score[0] <= 0) {
        state.winnerPlayer = 'P2';
        state.winnerName = state.p2Name;
      } else {
        state.winnerPlayer = 'P1';
        state.winnerName = state.p1Name;
      }
    }
  } else if (state.countdownStart) {
    state.countdownTicks += 1;
    if (state.countdownTicks > COUNTDOWN_END_TICK) {
      state.gameStarted = true;
      state.countdownStart = false;
    }
  }
  state.pointChanges = state.pointChanges
    .map((change) => ({
      ...change,
      p1YOffsetPx: change.p1YOffsetPx - 1,
      p2YOffsetPx: change.p2YOffsetPx - 1,
      alpha: change.alpha - 0.1 / 6,
    }))
    .filter((change) => change.alpha >= 0);
}

function movePlayers(state: OnlineAuthoritativeState): void {
  moveSnake(state.p1);
  moveSnake(state.p2);
}

function moveSnake(snake: SnakeState): void {
  snake.body.unshift([snake.head[0], snake.head[1]]);
  snake.body.pop();
  snake.dir = snake.dirWanted;
  switch (snake.dir) {
    case 'Up':
      snake.head[1] -= 1;
      break;
    case 'Down':
      snake.head[1] += 1;
      break;
    case 'Left':
      snake.head[0] -= 1;
      break;
    case 'Right':
      snake.head[0] += 1;
      break;
  }
}

function checkCollisions(state: OnlineAuthoritativeState): void {
  if (samePos(state.p1.head, state.p2.head)) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  /**
   * Head-on pass-through: adjacent heads swap cells in one tick. Body checks alone would
   * reset one snake first and respawn them, so the other head→body hit never runs — only one dies.
   * Mirror legacy `chain-duel-react` engine: treat facing adjacent heads (after the move) as mutual death.
   */
  if (
    state.p1.head[0] === state.p2.head[0] + 1 &&
    state.p2.head[1] === state.p1.head[1] &&
    state.p1.dir === 'Right' &&
    state.p2.dir === 'Left' &&
    state.p1.dirWanted === 'Right' &&
    state.p2.dirWanted === 'Left'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] - 1 &&
    state.p2.head[1] === state.p1.head[1] &&
    state.p1.dir === 'Left' &&
    state.p2.dir === 'Right' &&
    state.p1.dirWanted === 'Left' &&
    state.p2.dirWanted === 'Right'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] &&
    state.p1.head[1] === state.p2.head[1] - 1 &&
    state.p1.dir === 'Up' &&
    state.p2.dir === 'Down' &&
    state.p1.dirWanted === 'Up' &&
    state.p2.dirWanted === 'Down'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (
    state.p1.head[0] === state.p2.head[0] &&
    state.p1.head[1] === state.p2.head[1] + 1 &&
    state.p1.dir === 'Down' &&
    state.p2.dir === 'Up' &&
    state.p1.dirWanted === 'Down' &&
    state.p2.dirWanted === 'Up'
  ) {
    resetSnake(state, 'P1');
    resetSnake(state, 'P2');
  }
  if (outOfBounds(state, state.p1.head)) resetSnake(state, 'P1');
  if (outOfBounds(state, state.p2.head)) resetSnake(state, 'P2');

  for (const pos of state.p1.body) {
    if (samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
  for (const pos of state.p2.body) {
    if (samePos(state.p1.head, pos)) resetSnake(state, 'P1');
    if (samePos(state.p2.head, pos)) resetSnake(state, 'P2');
  }
}

function outOfBounds(state: OnlineAuthoritativeState, pos: GridPos): boolean {
  return pos[0] > state.cols - 1 || pos[1] < 0 || pos[1] > state.rows - 1 || pos[0] < 0;
}

function captureCoinbase(state: OnlineAuthoritativeState): void {
  for (let i = 0; i < state.coinbases.length; i += 1) {
    const cb = state.coinbases[i];
    if (samePos(state.p1.head, cb.pos)) {
      changeScore(state, 'P1', cb);
      increaseBody(state.p1);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP1 = getCaptureLabel(state.p1.body.length);
      return;
    }
    if (samePos(state.p2.head, cb.pos)) {
      changeScore(state, 'P2', cb);
      increaseBody(state.p2);
      if (!cb.reward) createNewCoinbase(state);
      state.coinbases.splice(i, 1);
      state.currentCaptureP2 = getCaptureLabel(state.p2.body.length);
      return;
    }
  }
}

function increaseBody(snake: SnakeState): void {
  const last = snake.body[snake.body.length - 1];
  const beforeLast = snake.body.length > 1 ? snake.body[snake.body.length - 2] : snake.head;
  if (last[0] < beforeLast[0]) snake.body.push([last[0] - 1, last[1]]);
  else if (last[0] > beforeLast[0]) snake.body.push([last[0] + 1, last[1]]);
  else if (last[1] < beforeLast[1]) snake.body.push([last[0], last[1] - 1]);
  else snake.body.push([last[0], last[1] + 1]);
}

function changeScore(state: OnlineAuthoritativeState, player: PlayerId, cb: Coinbase): void {
  const change =
    cb.reward != null
      ? Math.floor((state.totalPoints * cb.reward) / 100)
      : Math.floor((state.totalPoints * capturePercentByLength(getLength(state, player))) / 100);
  const safeChange = Math.max(1, change);
  state.pointChanges.push({
    player,
    value: safeChange,
    p1Pos: [state.p1.head[0], state.p1.head[1]],
    p2Pos: [state.p2.head[0], state.p2.head[1]],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });
  if (player === 'P1') {
    state.score[0] = Math.min(state.totalPoints, state.score[0] + safeChange);
    state.score[1] = Math.max(0, state.score[1] - safeChange);
  } else {
    state.score[1] = Math.min(state.totalPoints, state.score[1] + safeChange);
    state.score[0] = Math.max(0, state.score[0] - safeChange);
  }
}

function createNewCoinbase(state: OnlineAuthoritativeState): void {
  let accepted = false;
  let attempts = 0;
  while (!accepted && attempts < 1000) {
    const x = Math.floor(Math.random() * state.cols);
    const y = Math.floor(Math.random() * state.rows);
    if (!hasCollisionAt(state, [x, y])) {
      state.coinbases.push({ pos: [x, y] });
      accepted = true;
    }
    attempts += 1;
  }
}

/**
 * Extra coinbase when a new Bitcoin block is found (server polls mempool.space).
 * Fee tiers match legacy P2P `createNewCoinbase(state, feeValue)` in chain-duel-react.
 * Use `medianFeeSatPerVb < 0` for a plain apple (no multiplier) when fee is missing.
 */
export function spawnBlockRewardCoinbase(
  state: OnlineAuthoritativeState,
  medianFeeSatPerVb: number
): boolean {
  if (!state.gameStarted || state.gameEnded) {
    return false;
  }
  let reward: Coinbase['reward'] | undefined;
  if (Number.isFinite(medianFeeSatPerVb) && medianFeeSatPerVb >= 0) {
    if (medianFeeSatPerVb < 15) reward = 2;
    else if (medianFeeSatPerVb < 45) reward = 4;
    else if (medianFeeSatPerVb < 135) reward = 8;
    else if (medianFeeSatPerVb < 405) reward = 16;
    else reward = 32;
  }
  let accepted = false;
  let attempts = 0;
  while (!accepted && attempts < 1000) {
    const x = Math.floor(Math.random() * state.cols);
    const y = Math.floor(Math.random() * state.rows);
    if (!hasCollisionAt(state, [x, y])) {
      state.coinbases.push(reward != null ? { pos: [x, y], reward } : { pos: [x, y] });
      accepted = true;
    }
    attempts += 1;
  }
  return accepted;
}

function getLength(state: OnlineAuthoritativeState, player: PlayerId): number {
  return player === 'P1' ? state.p1.body.length : state.p2.body.length;
}

function capturePercentByLength(length: number): number {
  for (const level of CAPTURE_LEVELS) {
    if (length >= level.minLength && length <= level.maxLength) {
      return level.percent;
    }
  }
  return 2;
}

/** Used when rebuilding snapshots from compact replays (body segment count). */
export function getCaptureLabel(length: number): string {
  return `${capturePercentByLength(length)}%`;
}

function resetSnake(state: OnlineAuthoritativeState, player: PlayerId): void {
  if (player === 'P1') {
    state.p1.head = [6, 12];
    state.p1.body = [[5, 12]];
    state.p1.dir = '';
    state.p1.dirWanted = 'Right';
    state.currentCaptureP1 = '2%';
  } else {
    state.p2.head = [44, 12];
    state.p2.body = [[45, 12]];
    state.p2.dir = '';
    state.p2.dirWanted = 'Left';
    state.currentCaptureP2 = '2%';
  }
}

function hasCollisionAt(state: OnlineAuthoritativeState, pos: GridPos): boolean {
  if (samePos(state.p1.head, pos) || samePos(state.p2.head, pos)) return true;
  if (state.p1.body.some((part) => samePos(part, pos))) return true;
  if (state.p2.body.some((part) => samePos(part, pos))) return true;
  if (state.coinbases.some((cb) => samePos(cb.pos, pos))) return true;
  return false;
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
