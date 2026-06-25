import type { Direction, OnlineAuthoritativeState, PlayerId } from './onlineEngine';
import { tryApplyOnlineWantedDirection } from './onlineEngine';

export type OnlineInputAxis = 'up' | 'down' | 'left' | 'right';

export interface OnlineRoomInputPayload {
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  /** Keydown edge — latched and queued for the next sim tick. */
  intent?: OnlineInputAxis;
  /** Last keydown axis while held (fixes diagonal: most recent wins). */
  lastAxis?: OnlineInputAxis;
}

export interface OnlineSessionInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  lastAxis?: OnlineInputAxis;
  latchedDir: Direction | '';
  pendingTurn: Direction | '';
  /** After respawn, ignore held/latched steering until all direction keys are released. */
  steerLockUntilRelease: boolean;
}

const AXIS_TO_DIR: Record<OnlineInputAxis, Exclude<Direction, ''>> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

export function emptySessionInput(): OnlineSessionInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    latchedDir: '',
    pendingTurn: '',
    steerLockUntilRelease: false,
  };
}

/** Clear stale turn state after genesis respawn so death direction is not reused. */
export function clearSteeringOnRespawn(input: OnlineSessionInput): void {
  input.latchedDir = '';
  input.pendingTurn = '';
  input.steerLockUntilRelease = true;
}

function hasHeldDirection(input: OnlineSessionInput): boolean {
  return input.up || input.down || input.left || input.right;
}

export function mergeSessionInput(
  prev: OnlineSessionInput | undefined,
  payload: OnlineRoomInputPayload
): OnlineSessionInput {
  const base = prev ?? emptySessionInput();
  let lastAxis = base.lastAxis;
  if (payload.intent) {
    lastAxis = payload.intent;
  } else if (payload.lastAxis) {
    lastAxis = payload.lastAxis;
  } else if (payload.up) lastAxis = 'up';
  else if (payload.down) lastAxis = 'down';
  else if (payload.left) lastAxis = 'left';
  else if (payload.right) lastAxis = 'right';

  const input: OnlineSessionInput = {
    up: !!payload.up,
    down: !!payload.down,
    left: !!payload.left,
    right: !!payload.right,
    lastAxis,
    latchedDir: base.latchedDir,
    pendingTurn: base.pendingTurn,
    steerLockUntilRelease: base.steerLockUntilRelease,
  };
  if (input.steerLockUntilRelease && !hasHeldDirection(input)) {
    input.steerLockUntilRelease = false;
    input.lastAxis = undefined;
    input.latchedDir = '';
  }
  return input;
}

export function axisToDirection(axis: OnlineInputAxis): Exclude<Direction, ''> {
  return AXIS_TO_DIR[axis];
}

/** Direction from held keys; prefers `lastAxis` when that axis is still held. */
export function directionFromHeld(input: OnlineSessionInput): Exclude<Direction, ''> | null {
  if (input.lastAxis && input[input.lastAxis]) {
    return AXIS_TO_DIR[input.lastAxis];
  }
  if (input.up) return 'Up';
  if (input.down) return 'Down';
  if (input.left) return 'Left';
  if (input.right) return 'Right';
  return null;
}

function applyDirection(
  state: OnlineAuthoritativeState,
  player: PlayerId,
  input: OnlineSessionInput,
  dir: Exclude<Direction, ''>
): void {
  if (tryApplyOnlineWantedDirection(state, player, dir)) {
    input.latchedDir = dir;
  }
}

export function applySessionSteering(
  state: OnlineAuthoritativeState,
  player: PlayerId,
  input: OnlineSessionInput
): void {
  if (input.steerLockUntilRelease) {
    return;
  }
  const heldDir = directionFromHeld(input);
  if (heldDir) {
    applyDirection(state, player, input, heldDir);
    return;
  }
  if (input.latchedDir) {
    tryApplyOnlineWantedDirection(state, player, input.latchedDir);
  }
}

/** Queue + immediately apply a keydown intent (couch P2P tap parity). */
export function applyInputIntent(
  state: OnlineAuthoritativeState,
  player: PlayerId,
  input: OnlineSessionInput,
  axis: OnlineInputAxis
): void {
  if (input.steerLockUntilRelease) {
    return;
  }
  const dir = axisToDirection(axis);
  input.pendingTurn = dir;
  applyDirection(state, player, input, dir);
}

/** Consumed once per sim tick before held/latched steering. */
export function consumePendingTurn(
  state: OnlineAuthoritativeState,
  player: PlayerId,
  input: OnlineSessionInput
): void {
  if (input.steerLockUntilRelease) {
    input.pendingTurn = '';
    return;
  }
  const dir = input.pendingTurn;
  if (!dir) return;
  input.pendingTurn = '';
  applyDirection(state, player, input, dir);
}
