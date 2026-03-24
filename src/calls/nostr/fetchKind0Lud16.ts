import { SimplePool } from 'nostr-tools';

const READ_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

/** Reads `lud16` from the author's latest kind 0 profile JSON (NIP-57 / LUD-16). */
export async function fetchKind0Lud16(pubkey: string): Promise<string | undefined> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(READ_RELAYS, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });
    const ev = events[0];
    if (!ev?.content) {
      return undefined;
    }
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(ev.content) as Record<string, unknown>;
    } catch {
      return undefined;
    }
    const lud16 = typeof content.lud16 === 'string' ? content.lud16.trim() : '';
    if (lud16.includes('@')) {
      return lud16;
    }
    return undefined;
  } finally {
    pool.close(READ_RELAYS);
  }
}
