import { SimplePool, type Event } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';
import {
  fetchUserRelayList,
  mergeOutboxRelays,
  type UserRelayList,
} from './fetchUserRelayList';

export type AuthorRelayContext = {
  relayList: UserRelayList | null;
  relays: string[];
};

/** NIP-65 outbox relays for a pubkey, merged with server defaults. */
export async function fetchAuthorRelayContext(pubkey: string): Promise<AuthorRelayContext> {
  const relayList = await fetchUserRelayList(pubkey);
  return { relayList, relays: mergeOutboxRelays(relayList, NOSTR_RELAYS) };
}

export function pickLatestAuthorEvent(
  events: Event[],
  pubkey: string,
  kind: number
): Event | null {
  const hex = pubkey.toLowerCase();
  let best: Event | null = null;
  for (const ev of events) {
    if (ev.pubkey?.toLowerCase() !== hex || ev.kind !== kind) continue;
    if (!best || ev.created_at > best.created_at) best = ev;
  }
  return best;
}

export async function fetchLatestAuthorEvent(
  pubkey: string,
  kind: number,
  options?: { relayContext?: AuthorRelayContext; limit?: number }
): Promise<Event | null> {
  const relayContext = options?.relayContext ?? (await fetchAuthorRelayContext(pubkey));
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relayContext.relays, {
      kinds: [kind],
      authors: [pubkey],
      limit: options?.limit ?? 25,
    });
    return pickLatestAuthorEvent(events, pubkey, kind);
  } finally {
    pool.close(relayContext.relays);
  }
}
