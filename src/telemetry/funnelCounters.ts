import {
  hydrateCountersFromDisk,
  schedulePersistCounters,
} from './telemetryStore';

const counters: Record<string, number> = hydrateCountersFromDisk();

function counterKey(parts: Array<string | undefined>): string {
  return parts.filter((p) => p != null && p !== '').join(':');
}

export function bumpFunnelCounter(parts: {
  event: string;
  outcome: string;
  reason?: string;
  challengeId?: string;
}): void {
  const base = counterKey([parts.event, parts.outcome, parts.reason]);
  counters[base] = (counters[base] ?? 0) + 1;
  if (parts.challengeId) {
    const scoped = counterKey([parts.event, parts.outcome, parts.reason, parts.challengeId]);
    counters[scoped] = (counters[scoped] ?? 0) + 1;
  }
  schedulePersistCounters({ ...counters });
}

export function getFunnelCountersSnapshot(): Record<string, number> {
  return { ...counters };
}

export type ParsedCounterRow = {
  event: string;
  outcome: string;
  reason?: string;
  challengeId?: string;
  count: number;
};

/** Parse flat counter keys `event:outcome` or `event:outcome:reason` (+ optional challengeId). */
export function parseFunnelCounters(raw?: Record<string, number>): ParsedCounterRow[] {
  const source = raw ?? counters;
  const rows: ParsedCounterRow[] = [];
  for (const [key, count] of Object.entries(source)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const parts = key.split(':');
    if (parts.length < 2) continue;
    const event = parts[0];
    const outcome = parts[1];
    if (parts.length === 2) {
      rows.push({ event, outcome, count });
      continue;
    }
    if (parts.length === 3) {
      rows.push({ event, outcome, reason: parts[2], count });
      continue;
    }
    if (parts.length >= 4) {
      rows.push({
        event,
        outcome,
        reason: parts[2],
        challengeId: parts.slice(3).join(':'),
        count,
      });
    }
  }
  return rows;
}

export function sumCounter(
  rows: ParsedCounterRow[],
  event: string,
  outcome?: string,
  reason?: string
): number {
  return rows
    .filter((r) => {
      if (r.challengeId) return false;
      if (r.event !== event) return false;
      if (outcome && r.outcome !== outcome) return false;
      if (reason !== undefined && r.reason !== reason) return false;
      return true;
    })
    .reduce((sum, r) => sum + r.count, 0);
}

export function topErrorReasons(
  rows: ParsedCounterRow[],
  event: string,
  limit = 10
): Array<{ reason: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.challengeId) continue;
    if (r.event !== event || r.outcome !== 'error' || !r.reason) continue;
    map.set(r.reason, (map.get(r.reason) ?? 0) + r.count);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function topRejectReasons(
  rows: ParsedCounterRow[],
  event: string,
  limit = 10
): Array<{ reason: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.challengeId) continue;
    if (r.event !== event || r.outcome !== 'reject' || !r.reason) continue;
    map.set(r.reason, (map.get(r.reason) ?? 0) + r.count);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
