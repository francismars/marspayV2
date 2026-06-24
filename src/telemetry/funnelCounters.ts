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
