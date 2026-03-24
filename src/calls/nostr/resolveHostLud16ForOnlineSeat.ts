import { fetchKind0Lud16 } from './fetchKind0Lud16';
import { fetchKind1NoteEvent } from './fetchKind1NoteEvent';

/**
 * LNURL-pay LUD-16 for the Kind1 **author** only: load Kind1 by id, then read `lud16` from their kind 0 profile.
 * No env or stored overrides — seat zaps always follow the note publisher's profile.
 */
export async function resolveHostLud16ForOnlineSeat(kind1EventId: string): Promise<string | undefined> {
  try {
    const ev = await fetchKind1NoteEvent(kind1EventId);
    const lud = await fetchKind0Lud16(ev.pubkey);
    return lud?.trim() || undefined;
  } catch {
    return undefined;
  }
}
