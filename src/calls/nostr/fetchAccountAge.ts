import { SimplePool } from 'nostr-tools';
import type { AuthorRelayContext } from './fetchAuthorEvents';
import { fetchAuthorRelayContext } from './fetchAuthorEvents';

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

export type AccountAgeResult = {
  ok: boolean;
  earliestCreatedAt: number | null;
  ageDays: number | null;
  meetsMinimum: boolean;
};

/**
 * Earliest relay-visible event for pubkey.
 * Paginates backward with `until` — a single limited query only sees recent events
 * and understates account age.
 */
export async function fetchAccountAge(
  pubkey: string,
  options?: { relayContext?: AuthorRelayContext }
): Promise<AccountAgeResult> {
  const relayContext = options?.relayContext ?? (await fetchAuthorRelayContext(pubkey));
  const pool = new SimplePool();
  const now = Math.floor(Date.now() / 1000);
  const hex = pubkey.toLowerCase();
  try {
    let until = now;
    let earliest: number | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const events = await pool.querySync(relayContext.relays, {
        authors: [hex],
        until,
        limit: PAGE_SIZE,
      });
      const owned = events.filter((ev) => ev.pubkey?.toLowerCase() === hex);
      if (owned.length === 0) break;

      for (const ev of owned) {
        if (earliest === null || ev.created_at < earliest) {
          earliest = ev.created_at;
        }
      }

      const pageMin = Math.min(...owned.map((ev) => ev.created_at));
      if (owned.length < PAGE_SIZE || pageMin <= 1) break;
      until = pageMin - 1;
    }

    if (earliest === null) {
      return { ok: false, earliestCreatedAt: null, ageDays: null, meetsMinimum: false };
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
    pool.close(relayContext.relays);
  }
}

export const MIN_ACCOUNT_AGE_DAYS = 30;
