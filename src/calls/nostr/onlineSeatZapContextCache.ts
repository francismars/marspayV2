import type { LnurlPayMetadata } from './lnurlZapShared';

export type OnlineSeatZapContext = {
  kind1EventId: string;
  buyinSats: number;
  hostLud16: string;
  meta: LnurlPayMetadata;
  lnurlBech32: string;
  kind1AuthorPubkey: string;
};

const TTL_MS = 3 * 60 * 1000;
const bySessionRoom = new Map<string, { ctx: OnlineSeatZapContext; at: number }>();

export function onlineSeatZapCacheKey(sessionID: string, roomId: string): string {
  return `${sessionID}:${roomId}`;
}

export function rememberOnlineSeatZapContext(
  sessionID: string,
  roomId: string,
  ctx: OnlineSeatZapContext
): void {
  bySessionRoom.set(onlineSeatZapCacheKey(sessionID, roomId), {
    ctx,
    at: Date.now(),
  });
}

export function recallOnlineSeatZapContext(
  sessionID: string,
  roomId: string,
  kind1EventId: string,
  buyinSats: number
): OnlineSeatZapContext | undefined {
  const hit = bySessionRoom.get(onlineSeatZapCacheKey(sessionID, roomId));
  if (!hit || Date.now() - hit.at > TTL_MS) {
    return undefined;
  }
  const { ctx } = hit;
  if (ctx.kind1EventId !== kind1EventId || ctx.buyinSats !== buyinSats) {
    return undefined;
  }
  return ctx;
}

export function forgetOnlineSeatZapContext(sessionID: string, roomId: string): void {
  bySessionRoom.delete(onlineSeatZapCacheKey(sessionID, roomId));
}
