import {
  encodeLnurlBech32,
  fetchLnurlPayMetadataCached,
  lud16ToLnurlPayUrl,
  type LnurlPayMetadata,
} from './lnurlZapShared';
import { fetchKind0Lud16 } from './fetchKind0Lud16';
import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import { resolveKind1NoteEventById } from './resolveKind1NoteEvent';
import type { OnlineSeatZapContext } from './onlineSeatZapContextCache';

export type ResolvedOnlineSeatZapContext = OnlineSeatZapContext;

async function resolveHostLud16ForPubkey(pubkey: string): Promise<string | undefined> {
  const profile = await fetchNostrAppProfile(pubkey);
  const fromProfile = profile.lud16?.trim();
  if (fromProfile?.includes('@')) {
    return fromProfile;
  }
  const lud = await fetchKind0Lud16(pubkey);
  return lud?.trim() || undefined;
}

/** Single pass: kind1 (memory-first) + host lud16 (cached profile) + LNURL metadata (cached). */
export async function resolveOnlineSeatZapContext(
  kind1EventId: string,
  buyinSats: number
): Promise<ResolvedOnlineSeatZapContext> {
  const kind1Ev = await resolveKind1NoteEventById(kind1EventId);
  const hostLud16 = await resolveHostLud16ForPubkey(kind1Ev.pubkey);
  if (!hostLud16) {
    throw new Error('host_ln_unknown');
  }
  const meta = await fetchLnurlPayMetadataCached(hostLud16);
  if (!meta.allowsNostr || !meta.nostrPubkey) {
    throw new Error('recipient_lnurl_no_zap');
  }
  const lnurlpHttpsUrl = lud16ToLnurlPayUrl(hostLud16);
  const lnurlBech32 = encodeLnurlBech32(lnurlpHttpsUrl);
  return {
    kind1EventId,
    buyinSats,
    hostLud16,
    meta,
    lnurlBech32,
    kind1AuthorPubkey: kind1Ev.pubkey,
  };
}

/** @deprecated Prefer `resolveOnlineSeatZapContext` — kept for narrow lud16-only callers. */
export async function resolveHostLud16ForOnlineSeat(
  kind1EventId: string
): Promise<string | undefined> {
  try {
    const kind1Ev = await resolveKind1NoteEventById(kind1EventId);
    return resolveHostLud16ForPubkey(kind1Ev.pubkey);
  } catch {
    return undefined;
  }
}

export type { LnurlPayMetadata };
