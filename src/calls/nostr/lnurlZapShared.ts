import { bech32 } from '@scure/base';
import { SimplePool, type Event, type EventTemplate } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';

/** NIP-57 kind-9734 zap request targeting a kind-1 note (works across nostr-tools versions). */
export function buildKind1ZapRequestTemplate(params: {
  kind1EventId: string;
  kind1AuthorPubkey: string;
  amountMsats: number;
  relays: readonly string[];
  comment: string;
  lnurlBech32: string;
}): EventTemplate {
  const author = params.kind1AuthorPubkey.toLowerCase();
  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    content: params.comment,
    tags: [
      ['p', author],
      ['e', params.kind1EventId],
      ['amount', params.amountMsats.toString()],
      ['relays', ...params.relays],
      ['k', '1'],
      ['lnurl', params.lnurlBech32],
    ],
  };
}

/** Wait until the kind-1 is visible on relays (or timeout). */
export async function waitForKind1OnRelays(
  eventId: string,
  relays: readonly string[] = NOSTR_RELAYS,
  timeoutMs = 12_000,
): Promise<boolean> {
  const pool = new SimplePool();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const events = await pool.querySync([...relays], { ids: [eventId], kinds: [1] });
      if (events.length > 0) return true;
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  } finally {
    pool.close([...relays]);
  }
}

/** LUD-16 `user@domain` → `https://domain/.well-known/lnurlp/user` */
export function lud16ToLnurlPayUrl(lud16: string): string {
  const [name, domain] = lud16.trim().split('@');
  if (!name || !domain) {
    throw new Error('invalid_lud16');
  }
  return new URL(`/.well-known/lnurlp/${encodeURIComponent(name)}`, `https://${domain}`).toString();
}

/** LNURL-pay HTTPS URL → `lnurl1…` (Appendix B `lnurl` query param). */
export function encodeLnurlBech32(httpsLnurlpUrl: string): string {
  const data = new TextEncoder().encode(httpsLnurlpUrl);
  const words = bech32.toWords(data);
  return bech32.encode('lnurl', words, 2000);
}

export interface LnurlPayMetadata {
  callback: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export async function fetchLnurlPayMetadata(lud16: string): Promise<LnurlPayMetadata> {
  const url = lud16ToLnurlPayUrl(lud16);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`lnurlp_fetch_${res.status}`);
  }
  const data = (await res.json()) as LnurlPayMetadata;
  if (!data.callback) {
    throw new Error('lnurlp_no_callback');
  }
  return data;
}

export async function fetchZapInvoiceFromCallback(
  callback: string,
  signedZapRequest: Event,
  lnurlBech32: string,
  millisats: number
): Promise<string> {
  const nostrParam = encodeURIComponent(JSON.stringify(signedZapRequest));
  const lnurlParam = encodeURIComponent(lnurlBech32);
  const sep = callback.includes('?') ? '&' : '?';
  const url = `${callback}${sep}amount=${millisats}&nostr=${nostrParam}&lnurl=${lnurlParam}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`zap_callback_${res.status}`);
  }
  const data = (await res.json()) as { status?: string; reason?: string; pr?: string };
  if (data.status === 'ERROR' || (data.reason && !data.pr)) {
    throw new Error(data.reason ?? 'lnurl_error');
  }
  if (!data.pr || typeof data.pr !== 'string') {
    throw new Error('no_pr_invoice');
  }
  return data.pr;
}
