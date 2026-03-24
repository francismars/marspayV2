import type { Kind1 } from '../../types/nostr';
import { fetchKind0Lud16 } from './fetchKind0Lud16';
import { fetchKind1NoteEvent } from './fetchKind1NoteEvent';

/**
 * Host LNURL-pay identifier for online seat zaps: stored Kind1, then env, then Kind1 author's profile `lud16`.
 * Aligns with `paidLNURL` using `HOST_LNADDRESS` when Kind1 metadata has no explicit address.
 */
export async function resolveHostLud16ForOnlineSeat(
  kind1EventId: string,
  kind1Info?: Kind1 | null
): Promise<string | undefined> {
  const fromStored = kind1Info?.hostLNAddress?.trim();
  if (fromStored) {
    return fromStored;
  }
  const onlineDefault = (process.env.ONLINE_DEFAULT_HOST_LUD16 || '').trim();
  if (onlineDefault) {
    return onlineDefault;
  }
  const hostEnv = (process.env.HOST_LNADDRESS || '').trim();
  if (hostEnv) {
    return hostEnv;
  }
  try {
    const ev = await fetchKind1NoteEvent(kind1EventId);
    const lud = await fetchKind0Lud16(ev.pubkey);
    return lud?.trim() || undefined;
  } catch {
    return undefined;
  }
}
