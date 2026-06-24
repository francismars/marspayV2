import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import type { ChallengeTelemetrySnapshot } from '../state/challengeTelemetry';

const TELEMETRY_DIR = 'telemetry';
const CHALLENGE_STATS_FILE = 'challenge_stats.json';
const COUNTERS_FILE = 'counters.json';

const PERSIST_DEBOUNCE_MS = 1000;

let challengeStatsFlushTimer: ReturnType<typeof setTimeout> | null = null;
let countersFlushTimer: ReturnType<typeof setTimeout> | null = null;

let pendingChallengeStats: ChallengeTelemetrySnapshot | null = null;
let pendingCounters: Record<string, number> | null = null;

function telemetryDir(): string {
  return path.join(process.cwd(), 'data', TELEMETRY_DIR);
}

function ensureDirSync(): void {
  fs.mkdirSync(telemetryDir(), { recursive: true });
}

export function hydrateChallengeStatsFromDisk(): ChallengeTelemetrySnapshot | null {
  const filePath = path.join(telemetryDir(), CHALLENGE_STATS_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ChallengeTelemetrySnapshot;
    if (
      typeof raw.totalWins !== 'number' ||
      typeof raw.totalReplayFailed !== 'number' ||
      !raw.byChallenge ||
      typeof raw.byChallenge !== 'object'
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function hydrateCountersFromDisk(): Record<string, number> {
  const filePath = path.join(telemetryDir(), COUNTERS_FILE);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeJson(fileName: string, data: unknown): Promise<void> {
  try {
    ensureDirSync();
    const filePath = path.join(telemetryDir(), fileName);
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[telemetry] persist ${fileName} failed`, e);
  }
}

export function schedulePersistChallengeStats(snapshot: ChallengeTelemetrySnapshot): void {
  pendingChallengeStats = snapshot;
  if (challengeStatsFlushTimer) return;
  challengeStatsFlushTimer = setTimeout(() => {
    challengeStatsFlushTimer = null;
    const payload = pendingChallengeStats;
    pendingChallengeStats = null;
    if (payload) {
      void writeJson(CHALLENGE_STATS_FILE, payload);
    }
  }, PERSIST_DEBOUNCE_MS);
}

export function schedulePersistCounters(counters: Record<string, number>): void {
  pendingCounters = counters;
  if (countersFlushTimer) return;
  countersFlushTimer = setTimeout(() => {
    countersFlushTimer = null;
    const payload = pendingCounters;
    pendingCounters = null;
    if (payload) {
      void writeJson(COUNTERS_FILE, payload);
    }
  }, PERSIST_DEBOUNCE_MS);
}
