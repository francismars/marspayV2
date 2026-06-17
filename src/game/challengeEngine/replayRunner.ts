import {
  COUNTDOWN_END_TICK,
} from './constants';
import {
  createGameState,
  setWantedDirection,
  startCountdown,
  stepGame,
} from './index';
import type { ChallengeCatalogEntry } from '../../state/challengeState';
import { challengeStartSatsPerPlayer } from '../../state/challengeState';
import type { ChallengeInputEntry } from '../../state/challengeState';
import { initRunRng, clearRunRng } from './runRng';
import type { Direction } from './types';

const MAX_SIM_STEPS = 60_000;

export type ReplayResult =
  | { ok: true; winnerPlayer: string; tickCount: number; simSteps: number }
  | {
      ok: false;
      reason: string;
      debug?: {
        winnerPlayer: string | null;
        simSteps: number;
        p1Score: number;
        p2Score: number;
        inputCount: number;
        lastInputTick: number | null;
      };
    };

function buildChallengeState(challenge: ChallengeCatalogEntry) {
  const isFfa = challenge.format === '4P FFA';
  const stake = challengeStartSatsPerPlayer(challenge);
  return createGameState({
    modeLabel: 'CHALLENGE',
    practiceMode: true,
    p1Human: true,
    p2Human: false,
    p3Human: false,
    p4Human: false,
    p1Name: 'Player',
    p2Name: 'BigToshi 🌊',
    p1Points: stake,
    p2Points: stake,
    aiTier: challenge.aiTier,
    ffaAiTier: isFfa ? challenge.aiTier : undefined,
    convergenceMode: false,
    powerupMode: challenge.powerup,
    teamMode: isFfa ? 'ffa' : 'solo',
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
      return {
        ok: false,
        reason: 'replay_no_end',
        debug: {
          winnerPlayer: state.winnerPlayer,
          simSteps: simStep,
          p1Score: state.score[0],
          p2Score: state.score[1],
          inputCount: params.inputLog.length,
          lastInputTick: params.inputLog.length
            ? Math.max(...params.inputLog.map((e) => e.tick))
            : null,
        },
      };
    }
    if (state.winnerPlayer !== 'P1') {
      return {
        ok: false,
        reason: 'replay_not_p1_win',
        debug: {
          winnerPlayer: state.winnerPlayer,
          simSteps: simStep,
          p1Score: state.score[0],
          p2Score: state.score[1],
          inputCount: params.inputLog.length,
          lastInputTick: params.inputLog.length
            ? Math.max(...params.inputLog.map((e) => e.tick))
            : null,
        },
      };
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
