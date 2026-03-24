import { SimplePool } from 'nostr-tools';

const READ_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

export type NostrProfileLite = {
  pubkey: string;
  name: string;
  picture: string | null;
};

function shortPubkeyLabel(pubkey: string): string {
  if (pubkey.length <= 16) {
    return pubkey;
  }
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}

export async function fetchNostrProfileMetadata(pubkey: string): Promise<NostrProfileLite> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(READ_RELAYS, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });
    const ev = events[0];
    if (!ev?.content) {
      return { pubkey, name: shortPubkeyLabel(pubkey), picture: null };
    }
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(ev.content) as Record<string, unknown>;
    } catch {
      return { pubkey, name: shortPubkeyLabel(pubkey), picture: null };
    }
    const displayName = typeof content.display_name === 'string' ? content.display_name.trim() : '';
    const name = typeof content.name === 'string' ? content.name.trim() : '';
    const picture = typeof content.picture === 'string' ? content.picture.trim() : null;
    const resolvedName = displayName || name || shortPubkeyLabel(pubkey);
    return {
      pubkey,
      name: resolvedName,
      picture: picture || null,
    };
  } finally {
    pool.close(READ_RELAYS);
  }
}
