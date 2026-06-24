import type { Socket } from 'socket.io';
import { trackEvent } from './trackEvent';

const ALLOWED_CLIENT_EVENTS = new Set([
  'client.page.view',
  'client.funnel.abandon',
  'client.ui.error',
]);

const MAX_EVENTS_PER_MINUTE = 20;
const clientEventBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitOk(sessionID: string): boolean {
  const now = Date.now();
  const bucket = clientEventBuckets.get(sessionID);
  if (!bucket || now >= bucket.resetAt) {
    clientEventBuckets.set(sessionID, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= MAX_EVENTS_PER_MINUTE) {
    return false;
  }
  bucket.count += 1;
  return true;
}

function sanitizeDetail(detail: unknown): string | undefined {
  if (typeof detail !== 'string') return undefined;
  return detail.trim().slice(0, 200);
}

export function reportClientEventHandler(
  socket: Socket,
  payload?: { event?: string; route?: string; detail?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const event = typeof payload?.event === 'string' ? payload.event.trim() : '';
  if (!ALLOWED_CLIENT_EVENTS.has(event)) {
    return;
  }
  if (!rateLimitOk(sessionID)) {
    return;
  }
  const route = typeof payload?.route === 'string' ? payload.route.trim().slice(0, 120) : undefined;
  const detail = sanitizeDetail(payload?.detail);
  trackEvent({
    event,
    outcome: 'ok',
    sessionID,
    source: 'client',
    meta: {
      ...(route ? { route } : {}),
      ...(detail ? { detail } : {}),
    },
  });
}
