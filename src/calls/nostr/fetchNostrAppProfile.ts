import { SimplePool } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';
import type { AppNostrProfile } from '../../state/nostrAppSessionState';
import { getCachedNostrProfile, setCachedNostrProfile } from './nostrProfileCache';

function shortPubkeyLabel(pubkey: string): string {
  if (pubkey.length <= 16) {
    return pubkey;
  }
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}

/** Kind-0 metadata for app Nostr session (relays read on server only). */
export async function fetchNostrAppProfile(pubkey: string): Promise<AppNostrProfile> {
  const cached = getCachedNostrProfile(pubkey);
  if (cached) {
    return cached;
  }
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(NOSTR_RELAYS, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });
    const ev = events[0];
    if (!ev?.content) {
      return {
        pubkey,
        name: shortPubkeyLabel(pubkey),
        picture: null,
        nip05: null,
        lud16: null,
        lud06: null,
      };
    }
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(ev.content) as Record<string, unknown>;
    } catch {
      return {
        pubkey,
        name: shortPubkeyLabel(pubkey),
        picture: null,
        nip05: null,
        lud16: null,
        lud06: null,
      };
    }
    const displayName = typeof content.display_name === 'string' ? content.display_name.trim() : '';
    const name = typeof content.name === 'string' ? content.name.trim() : '';
    const picture = typeof content.picture === 'string' ? content.picture.trim() || null : null;
    const nip05 = typeof content.nip05 === 'string' ? content.nip05.trim() || null : null;
    const lud16 = typeof content.lud16 === 'string' ? content.lud16.trim() || null : null;
    const lud06 = typeof content.lud06 === 'string' ? content.lud06.trim() || null : null;
    const resolvedName = displayName || name || shortPubkeyLabel(pubkey);
    const profile = {
      pubkey,
      name: resolvedName,
      picture,
      nip05,
      lud16,
      lud06,
    };
    setCachedNostrProfile(profile);
    return profile;
  } finally {
    pool.close(NOSTR_RELAYS);
  }
}
