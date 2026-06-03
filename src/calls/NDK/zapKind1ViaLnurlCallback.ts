import { hexToBytes } from '@noble/hashes/utils';
import { nip19, nip57, finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import dotenv from 'dotenv';
import payInvoice from '../LNBits/payInvoice';
import {
  encodeLnurlBech32,
  fetchLnurlPayMetadata,
  fetchZapInvoiceFromCallback,
  lud16ToLnurlPayUrl,
} from '../nostr/lnurlZapShared';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';
import { dateNow } from '../../utils/time';

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

function kind1EventStub(eventId: string, authorPubkey: string): Event {
  return {
    id: eventId,
    kind: 1,
    pubkey: authorPubkey.toLowerCase(),
    content: '',
    tags: [],
    created_at: 0,
    sig: '',
  };
}

/**
 * NIP-57: signed 9734 is sent to the recipient LNURL callback via GET (not published).
 * The recipient's LNURL server returns a bolt11; we pay it from LNBits. It then publishes 9735.
 * Ephemeral pubkey must already be registered with `registerNostrLink` so `subscribeEvent` can seat.
 */
export async function requestZapInvoiceAndPayForKind1(params: {
  kind1EventId: string;
  /** Hex pubkey of the kind-1 author (host note for online rooms). */
  kind1AuthorPubkey: string;
  buyinSats: number;
  zapSecretKeyBytes: Uint8Array;
  /** Recipient LUD-16 (Kind1 host / same nostr key as Kind1 author). */
  hostLud16: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  dotenv.config();

  try {
    getPublicKey(hostSecretKeyBytesFromEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [ZAP_LNURL] host key: ${msg}`);
    return { ok: false, reason: 'nostr_pk_invalid' };
  }

  let meta: Awaited<ReturnType<typeof fetchLnurlPayMetadata>>;
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
    event: kind1EventStub(params.kind1EventId, params.kind1AuthorPubkey),
    amount: millisats,
    relays: [...NOSTR_RELAYS],
    comment: '',
  });
  zapRequestTpl.tags.push(['lnurl', lnurlBech32]);

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
