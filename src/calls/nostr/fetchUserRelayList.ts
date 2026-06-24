import { SimplePool, type Event } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';

export type UserRelayList = {
  read: string[];
  write: string[];
  /** Relays where the user may publish (NIP-65 outbox). */
  outbox: string[];
};

function pickLatestRelayList(events: Event[], pubkey: string): Event | null {
  const hex = pubkey.toLowerCase();
  let best: Event | null = null;
  for (const ev of events) {
    if (ev.pubkey?.toLowerCase() !== hex || ev.kind !== 10002) continue;
    if (!best || ev.created_at > best.created_at) best = ev;
  }
  return best;
}

function normalizeRelayUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^wss?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Parse NIP-65 kind-10002 relay tags. */
export function parseUserRelayList(ev: Event | null): UserRelayList | null {
  if (!ev) return null;
  const read: string[] = [];
  const write: string[] = [];
  const outbox: string[] = [];
  const seen = new Set<string>();

  for (const tag of ev.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const relay = normalizeRelayUrl(tag[1]);
    if (!relay || seen.has(relay)) continue;
    seen.add(relay);

    const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : '';
    if (marker === 'write') {
      write.push(relay);
      outbox.push(relay);
    } else if (marker === 'read') {
      read.push(relay);
    } else {
      read.push(relay);
      write.push(relay);
      outbox.push(relay);
    }
  }

  if (read.length === 0 && write.length === 0) return null;
  return { read, write, outbox };
}

const MAX_OUTBOX_RELAYS = 16;

/** Latest NIP-65 relay list for pubkey (kind 10002). */
export async function fetchUserRelayList(pubkey: string): Promise<UserRelayList | null> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(NOSTR_RELAYS, {
      kinds: [10002],
      authors: [pubkey],
      limit: 5,
    });
    return parseUserRelayList(pickLatestRelayList(events, pubkey));
  } finally {
    pool.close(NOSTR_RELAYS);
  }
}

export function mergeOutboxRelays(
  relayList: UserRelayList | null,
  fallbackRelays: readonly string[]
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const add = (relay: string) => {
    const normalized = normalizeRelayUrl(relay);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  };

  for (const relay of relayList?.outbox ?? []) {
    if (merged.length >= MAX_OUTBOX_RELAYS) break;
    add(relay);
  }
  for (const relay of fallbackRelays) {
    if (merged.length >= MAX_OUTBOX_RELAYS) break;
    add(relay);
  }
  return merged;
}
