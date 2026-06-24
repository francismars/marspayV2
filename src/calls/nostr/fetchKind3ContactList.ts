import { SimplePool, type Event } from 'nostr-tools';
import { type AuthorRelayContext, fetchAuthorRelayContext, pickLatestAuthorEvent } from './fetchAuthorEvents';

function pickLatestKind3(events: Event[], pubkey: string): Event | null {
  return pickLatestAuthorEvent(events, pubkey, 3);
}

/**
 * Latest kind-3 contact list for pubkey.
 * Uses NIP-65 outbox relays first so we see the user's current list, not a stale
 * copy left on indexers / relays they no longer write to.
 */
export async function fetchKind3ContactList(
  pubkey: string,
  options?: { relayContext?: AuthorRelayContext }
): Promise<Event | null> {
  const relayContext = options?.relayContext ?? (await fetchAuthorRelayContext(pubkey));
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relayContext.relays, {
      kinds: [3],
      authors: [pubkey],
      limit: 25,
    });
    return pickLatestKind3(events, pubkey);
  } finally {
    pool.close(relayContext.relays);
  }
}

export function countKind3Follows(ev: Event | null): number {
  if (!ev) return 0;
  return ev.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string' && t[1].length > 0).length;
}

export function kind3FollowsPubkey(ev: Event | null, targetPubkey: string): boolean {
  if (!ev) return false;
  const target = targetPubkey.toLowerCase();
  return ev.tags.some(
    (t) => t[0] === 'p' && typeof t[1] === 'string' && t[1].toLowerCase() === target
  );
}
