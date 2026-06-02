import {
  CONVERGENCE_MIN_COLS,
  CONVERGENCE_MIN_ROWS,
  COUNTDOWN_END_TICK,
} from './constants';
import {
  createGameState,
  setWantedDirection,
  startCountdown,
  stepGame,
} from './index';
import type { ChallengeCatalogEntry } from '../../state/challengeState';
import type { ChallengeInputEntry } from '../../state/challengeState';
import { initRunRng, clearRunRng } from './runRng';
import type { Direction } from './types';

const MAX_SIM_STEPS = 60_000;
const PRACTICE_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS = 120;

export type ReplayResult =
  | { ok: true; winnerPlayer: string; tickCount: number; simSteps: number }
  | { ok: false; reason: string };

function buildChallengeState(challenge: ChallengeCatalogEntry) {
  const isFfa = challenge.format === '4P FFA';
  return createGameState({
    modeLabel: 'CHALLENGE',
    practiceMode: true,
    p1Human: true,
    p2Human: false,
    p3Human: false,
    p4Human: false,
    p1Name: 'Player',
    p2Name: 'BigToshi 🌊',
    p1Points: isFfa ? 1000 : 1000,
    p2Points: isFfa ? 1000 : 1000,
    aiTier: challenge.aiTier,
    ffaAiTier: isFfa ? challenge.aiTier : undefined,
    convergenceMode: true,
    powerupMode: challenge.powerup,
    teamMode: isFfa ? 'ffa' : 'solo',
    convergenceShrinkInterval: PRACTICE_HUB_CONVERGENCE_SHRINK_INTERVAL_TICKS,
    convergenceMinCols: CONVERGENCE_MIN_COLS,
    convergenceMinRows: CONVERGENCE_MIN_ROWS,
    convergenceStepMs: 100,
  });
}

function parseDir(raw: string): Exclude<Direction, ''> | null {
  if (raw === 'Up' || raw === 'Down' || raw === 'Left' || raw === 'Right') return raw;
  return null;
}

/**
 * Replay a challenge run. Input `tick` is simulation step index (0-based, one per stepGame call).
 */
export function replayChallengeWin(params: {
  seed: string;
  challenge: ChallengeCatalogEntry;
  inputLog: ChallengeInputEntry[];
  countdownStartTick?: number;
}): ReplayResult {
  initRunRng(params.seed);
  try {
    const state = buildChallengeState(params.challenge);
    startCountdown(state);

    const inputsByStep = new Map<number, ChallengeInputEntry[]>();
    for (const entry of params.inputLog) {
      const list = inputsByStep.get(entry.tick) ?? [];
      list.push(entry);
      inputsByStep.set(entry.tick, list);
    }

    let simStep = 0;
    while (!state.gameEnded && simStep < MAX_SIM_STEPS) {
      const batch = inputsByStep.get(simStep) ?? [];
      for (const inp of batch) {
        const dir = parseDir(inp.dir);
        if (dir) setWantedDirection(state, 'P1', dir);
      }
      stepGame(state);
      simStep += 1;
    }

    if (!state.gameEnded) {
      return { ok: false, reason: 'replay_no_end' };
    }
    if (state.winnerPlayer !== 'P1') {
      return { ok: false, reason: 'replay_not_p1_win' };
    }

    if (params.countdownStartTick != null && params.countdownStartTick > COUNTDOWN_END_TICK + 5) {
      return { ok: false, reason: 'replay_invalid_countdown' };
    }

    return {
      ok: true,
      winnerPlayer: state.winnerPlayer,
      tickCount: state.tickCount,
      simSteps: simStep,
    };
  } finally {
    clearRunRng();
  }
}
