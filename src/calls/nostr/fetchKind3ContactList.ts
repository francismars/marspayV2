import { SimplePool, type Event } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';

function pickLatestKind3(events: Event[], pubkey: string): Event | null {
  const hex = pubkey.toLowerCase();
  let best: Event | null = null;
  for (const ev of events) {
    if (ev.pubkey?.toLowerCase() !== hex || ev.kind !== 3) continue;
    if (!best || ev.created_at > best.created_at) best = ev;
  }
  return best;
}

/** Latest kind-3 contact list for pubkey. */
export async function fetchKind3ContactList(pubkey: string): Promise<Event | null> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(NOSTR_RELAYS, {
      kinds: [3],
      authors: [pubkey],
      limit: 5,
    });
    return pickLatestKind3(events, pubkey);
  } finally {
    pool.close(NOSTR_RELAYS);
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
