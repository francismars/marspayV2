import { dateNow } from '../utils/time';
import type { ChallengeEligibilityResult } from '../calls/nostr/challengeEligibility';
import { bumpFunnelCounter } from './funnelCounters';

export type TrackOutcome = 'ok' | 'reject' | 'error';

export type TrackPayload = {
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

export function pubkeyPrefix(pubkey: string | null | undefined): string | undefined {
  const hex = typeof pubkey === 'string' ? pubkey.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(hex)) return undefined;
  return hex.slice(0, 12);
}

function emitHumanTag(event: string, outcome: TrackOutcome, payload: TrackPayload): void {
  const session = payload.sessionID ?? 'unknown';
  if (event === 'challenge.run' && outcome === 'ok') {
    console.log(
      `${dateNow()} [CHALLENGE_START] sessionID=${session} challenge=${payload.challengeId ?? '?'} runId=${payload.runId ?? '?'} pubkey=${payload.pubkeyPrefix ?? '?'}`
    );
    return;
  }
  if (event === 'challenge.eligibility') {
    console.log(
      `${dateNow()} [CHALLENGE_ELIGIBILITY] sessionID=${session} eligible=${outcome === 'ok'} reason=${payload.reason ?? ''}`
    );
    return;
  }
  if (event === 'session.connected') {
    console.log(
      `${dateNow()} [SESSION_CONNECT] sessionID=${session}${payload.meta?.reconnect ? ' reconnect=true' : ''}`
    );
    return;
  }
  if (event === 'session.disconnected') {
    console.log(
      `${dateNow()} [SESSION_DISCONNECT] sessionID=${session} durationMs=${payload.meta?.durationMs ?? '?'}`
    );
    return;
  }
  if (event === 'nostr.app.link' && outcome === 'ok') {
    console.log(
      `${dateNow()} [NOSTR_SIGNIN] sessionID=${session} pubkey=${payload.pubkeyPrefix ?? '?'}`
    );
  }
}

export function trackEvent(payload: TrackPayload): void {
  const line = {
    type: 'track' as const,
    ts: new Date().toISOString(),
    ...payload,
  };
  console.log(JSON.stringify(line));
  bumpFunnelCounter({
    event: payload.event,
    outcome: payload.outcome,
    reason: payload.reason,
    challengeId: payload.challengeId,
  });
  emitHumanTag(payload.event, payload.outcome, payload);
}

export function trackReject(
  event: string,
  reason: string,
  ctx: Omit<TrackPayload, 'event' | 'outcome' | 'reason'> = {}
): void {
  trackEvent({ event, outcome: 'reject', reason, ...ctx });
}

function eligibilityFailureReasons(result: ChallengeEligibilityResult): string {
  if (result.eligible) return '';
  return Object.entries(result.checks)
    .filter(([, check]) => !check.pass)
    .map(([key, check]) => `${key}:${check.detail ?? 'fail'}`)
    .join(',');
}

export function trackEligibility(
  sessionID: string | undefined,
  result: ChallengeEligibilityResult,
  meta?: { refresh?: boolean }
): void {
  const prefix = pubkeyPrefix(result.pubkey);
  const failed = eligibilityFailureReasons(result);
  trackEvent({
    event: 'challenge.eligibility',
    outcome: result.eligible ? 'ok' : 'reject',
    reason: result.eligible ? undefined : failed || 'not_eligible',
    sessionID,
    pubkeyPrefix: prefix,
    meta: {
      refresh: meta?.refresh === true,
      signedIn: Boolean(result.pubkey),
    },
  });
}
