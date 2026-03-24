import { bech32 } from '@scure/base';
import { hexToBytes } from '@noble/hashes/utils';
import { nip19, nip57, finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import dotenv from 'dotenv';
import payInvoice from '../LNBits/payInvoice';
import { relaysNostr } from '../../consts/nostrRelays';
import { dateNow } from '../../utils/time';

const uniqueRelays = [...new Set(relaysNostr)];

function hostSecretKeyBytesFromEnv(): Uint8Array {
  const pk = process.env.NOSTR_PK;
  if (!pk) {
    throw new Error('NOSTR_PK missing');
  }
  if (pk.startsWith('nsec')) {
    const decoded = nip19.decode(pk);
    if (decoded.type !== 'nsec') {
      throw new Error('invalid nsec');
    }
    return decoded.data as Uint8Array;
  }
  const hex = pk.replace(/^0x/i, '');
  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error('NOSTR_PK must be nsec or 64 hex chars');
  }
  return hexToBytes(hex);
}

/** LUD-16 `user@domain` → `https://domain/.well-known/lnurlp/user` */
function lud16ToLnurlPayUrl(lud16: string): string {
  const [name, domain] = lud16.trim().split('@');
  if (!name || !domain) {
    throw new Error('invalid_lud16');
  }
  return new URL(`/.well-known/lnurlp/${encodeURIComponent(name)}`, `https://${domain}`).toString();
}

/** LNURL-pay HTTPS URL → `lnurl1…` (Appendix B `lnurl` query param). */
function encodeLnurlBech32(httpsLnurlpUrl: string): string {
  const data = new TextEncoder().encode(httpsLnurlpUrl);
  const words = bech32.toWords(data);
  return bech32.encode('lnurl', words, 2000);
}

interface LnurlPayMetadata {
  callback: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

async function fetchLnurlPayMetadata(lud16: string): Promise<LnurlPayMetadata> {
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

async function fetchZapInvoiceFromCallback(
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

/**
 * NIP-57: signed 9734 is sent to the recipient LNURL callback via GET (not published).
 * The recipient's LNURL server returns a bolt11; we pay it from LNBits. It then publishes 9735.
 * Ephemeral pubkey must already be registered with `registerNostrLink` so `subscribeEvent` can seat.
 */
export async function requestZapInvoiceAndPayForKind1(params: {
  kind1EventId: string;
  buyinSats: number;
  zapSecretKeyBytes: Uint8Array;
  /** Recipient LUD-16 (Kind1 host / same nostr key as Kind1 author). */
  hostLud16: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  dotenv.config();

  let recipientPubkeyHex: string;
  try {
    recipientPubkeyHex = getPublicKey(hostSecretKeyBytesFromEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] host key: ${msg}`);
    return { ok: false, reason: 'nostr_pk_invalid' };
  }

  let meta: LnurlPayMetadata;
  try {
    meta = await fetchLnurlPayMetadata(params.hostLud16);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] lnurlp metadata: ${msg}`);
    return { ok: false, reason: 'lnurlp_metadata_failed' };
  }

  if (!meta.allowsNostr || !meta.nostrPubkey) {
    console.error(`${dateNow()} [ZAP_LNURL] recipient LNURL does not support nostr zaps (allowsNostr / nostrPubkey)`);
    return { ok: false, reason: 'recipient_lnurl_no_zap' };
  }

  const lnurlpHttpsUrl = lud16ToLnurlPayUrl(params.hostLud16);
  const lnurlBech32 = encodeLnurlBech32(lnurlpHttpsUrl);

  const millisats = params.buyinSats * 1000;
  const zapRequestTpl = nip57.makeZapRequest({
    profile: recipientPubkeyHex,
    event: params.kind1EventId,
    amount: millisats,
    relays: uniqueRelays,
    comment: '',
  });
  zapRequestTpl.tags.push(['lnurl', lnurlBech32]);
  zapRequestTpl.tags.push(['k', '1']);

  let signedZapRequest: Event;
  try {
    signedZapRequest = finalizeEvent(zapRequestTpl, params.zapSecretKeyBytes) as Event;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] sign 9734: ${msg}`);
    return { ok: false, reason: 'zap_request_sign_failed' };
  }

  let bolt11: string;
  try {
    bolt11 = await fetchZapInvoiceFromCallback(meta.callback, signedZapRequest, lnurlBech32, millisats);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] callback invoice: ${msg}`);
    return { ok: false, reason: 'zap_callback_invoice_failed' };
  }

  try {
    await payInvoice(bolt11);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] payInvoice: ${msg}`);
    return { ok: false, reason: 'zap_invoice_pay_failed' };
  }

  console.log(
    `${dateNow()} [ZAP_LNURL] paid zap invoice for kind1=${params.kind1EventId} (${params.buyinSats} sats); recipient LNURL should publish 9735`
  );
  return { ok: true };
}
