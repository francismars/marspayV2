import { bech32 } from '@scure/base';
import type { Event } from 'nostr-tools';

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
