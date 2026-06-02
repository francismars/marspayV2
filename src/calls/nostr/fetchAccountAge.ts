import { SimplePool } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export type AccountAgeResult = {
  ok: boolean;
  earliestCreatedAt: number | null;
  ageDays: number | null;
  meetsMinimum: boolean;
};

/** Earliest relay-visible event for pubkey (kind-0 preferred, any kind fallback). */
export async function fetchAccountAge(pubkey: string): Promise<AccountAgeResult> {
  const pool = new SimplePool();
  const now = Math.floor(Date.now() / 1000);
  try {
    const [kind0Events, anyEvents] = await Promise.all([
      pool.querySync(NOSTR_RELAYS, { kinds: [0], authors: [pubkey], limit: 20 }),
      pool.querySync(NOSTR_RELAYS, { authors: [pubkey], limit: 50 }),
    ]);
    const candidates = [...kind0Events, ...anyEvents].filter(
      (ev) => ev.pubkey?.toLowerCase() === pubkey.toLowerCase()
    );
    if (candidates.length === 0) {
      return { ok: false, earliestCreatedAt: null, ageDays: null, meetsMinimum: false };
    }
    let earliest = candidates[0]!.created_at;
    for (const ev of candidates) {
      if (ev.created_at < earliest) earliest = ev.created_at;
    }
    const ageSec = now - earliest;
    const ageDays = Math.floor(ageSec / (24 * 60 * 60));
    return {
      ok: true,
      earliestCreatedAt: earliest,
      ageDays,
      meetsMinimum: ageSec >= THIRTY_DAYS_SEC,
    };
  } finally {
    pool.close(NOSTR_RELAYS);
  }
}

export const MIN_ACCOUNT_AGE_DAYS = 30;
