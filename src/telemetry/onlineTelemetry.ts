import { trackEvent, trackReject } from './trackEvent';

type OnlineTrackCtx = {
  sessionID?: string;
  pubkeyPrefix?: string;
  roomId?: string;
  roomCode?: string;
  buyin?: number;
  amountSats?: number;
  meta?: Record<string, string | number | boolean>;
};

export function trackOnlineOk(event: string, ctx: OnlineTrackCtx): void {
  trackEvent({ event, outcome: 'ok', ...ctx });
}

export function trackOnlineReject(
  event: string,
  reason: string,
  ctx: OnlineTrackCtx = {}
): void {
  trackReject(event, reason, ctx);
}

const PING_SAMPLE_COOLDOWN_MS = 60_000;
const pingSampleState = new Map<string, { bucket: number; at: number }>();

function pingBucket(latencyMs: number): number {
  if (latencyMs < 50) return 50;
  if (latencyMs < 100) return 100;
  if (latencyMs < 200) return 200;
  if (latencyMs < 500) return 500;
  return 1000;
}

export function maybeTrackOnlinePing(params: {
  sessionID: string;
  roomId: string;
  latencyMs: number;
}): void {
  const bucket = pingBucket(params.latencyMs);
  const key = `${params.roomId}:${params.sessionID}`;
  const prev = pingSampleState.get(key);
  const now = Date.now();
  if (prev && prev.bucket === bucket && now - prev.at < PING_SAMPLE_COOLDOWN_MS) {
    return;
  }
  pingSampleState.set(key, { bucket, at: now });
  trackEvent({
    event: 'online.ping.reported',
    outcome: 'ok',
    sessionID: params.sessionID,
    roomId: params.roomId,
    meta: { latencyMs: params.latencyMs, bucket },
  });
}
