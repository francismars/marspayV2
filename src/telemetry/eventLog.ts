import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import type { TrackOutcome } from './trackEvent';

export type StoredTrackEvent = {
  type: 'track';
  ts: string;
  event: string;
  outcome: TrackOutcome;
  reason?: string;
  sessionID?: string;
  pubkeyPrefix?: string;
  challengeId?: string;
  runId?: string;
  roomId?: string;
  roomCode?: string;
  buyin?: number;
  amountSats?: number;
  replayMs?: number;
  source?: 'server' | 'client';
  meta?: Record<string, string | number | boolean>;
};

const RING_MAX = 500;
const EVENTS_FILE = 'events.jsonl';
const ROTATE_BYTES = 50 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 500;

const ringBuffer: StoredTrackEvent[] = [];
const pendingLines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function telemetryDir(): string {
  return path.join(process.cwd(), 'data', 'telemetry');
}

function eventsFilePath(): string {
  return path.join(telemetryDir(), EVENTS_FILE);
}

function ensureDirSync(): void {
  fs.mkdirSync(telemetryDir(), { recursive: true });
}

function maybeRotateEventsFile(): void {
  const filePath = eventsFilePath();
  if (!fs.existsSync(filePath)) return;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < ROTATE_BYTES) return;
    const rotated = `${filePath}.1`;
    if (fs.existsSync(rotated)) {
      fs.unlinkSync(rotated);
    }
    fs.renameSync(filePath, rotated);
  } catch (e) {
    console.error('[telemetry] events.jsonl rotate failed', e);
  }
}

async function flushPendingLines(): Promise<void> {
  flushTimer = null;
  if (pendingLines.length === 0) return;
  const batch = pendingLines.splice(0, pendingLines.length);
  try {
    ensureDirSync();
    maybeRotateEventsFile();
    await fsPromises.appendFile(eventsFilePath(), batch.join(''), 'utf8');
  } catch (e) {
    console.error('[telemetry] events.jsonl append failed', e);
  }
}

export function recordTrackEvent(event: StoredTrackEvent): void {
  ringBuffer.push(event);
  if (ringBuffer.length > RING_MAX) {
    ringBuffer.splice(0, ringBuffer.length - RING_MAX);
  }
  pendingLines.push(JSON.stringify(event) + '\n');
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flushPendingLines();
    }, PERSIST_DEBOUNCE_MS);
  }
}

export function getEventLogByteSize(): number {
  const filePath = eventsFilePath();
  if (!fs.existsSync(filePath)) return 0;
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function parseEventLine(line: string): StoredTrackEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const row = JSON.parse(trimmed) as StoredTrackEvent;
    if (row.type !== 'track' || typeof row.event !== 'string' || typeof row.ts !== 'string') {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

function matchesFilter(
  event: StoredTrackEvent,
  filters?: { eventPrefix?: string; outcome?: TrackOutcome; sinceTs?: string }
): boolean {
  if (filters?.eventPrefix && !event.event.startsWith(filters.eventPrefix.replace(/\*$/, ''))) {
    return false;
  }
  if (filters?.outcome && event.outcome !== filters.outcome) {
    return false;
  }
  if (filters?.sinceTs && event.ts < filters.sinceTs) {
    return false;
  }
  return true;
}

export function tailEventsFromDisk(
  limit: number,
  filters?: { eventPrefix?: string; outcome?: TrackOutcome; sinceTs?: string }
): StoredTrackEvent[] {
  const filePath = eventsFilePath();
  if (!fs.existsSync(filePath) || limit <= 0) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const rows: StoredTrackEvent[] = [];
    for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
      const row = parseEventLine(lines[i]);
      if (!row) continue;
      if (!matchesFilter(row, filters)) continue;
      rows.push(row);
    }
    return rows.reverse();
  } catch {
    return [];
  }
}

export function getRecentEvents(
  limit: number,
  filters?: { eventPrefix?: string; outcome?: TrackOutcome; sinceTs?: string }
): StoredTrackEvent[] {
  const capped = Math.min(Math.max(limit, 1), 200);
  const fromRing = ringBuffer.filter((e) => matchesFilter(e, filters));
  if (fromRing.length >= capped) {
    return fromRing.slice(-capped);
  }
  const needFromDisk = capped - fromRing.length;
  const fromDisk = tailEventsFromDisk(needFromDisk + fromRing.length, filters);
  const ringTs = new Set(fromRing.map((e) => e.ts + e.event + (e.sessionID ?? '')));
  const merged = [
    ...fromDisk.filter((e) => !ringTs.has(e.ts + e.event + (e.sessionID ?? ''))),
    ...fromRing,
  ];
  return merged.slice(-capped);
}
