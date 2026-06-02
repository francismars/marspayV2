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

function payerSecretKeyBytesFromEnv(): Uint8Array {
  const pk = process.env.NOSTR_PK;
  if (!pk) throw new Error('NOSTR_PK missing');
  if (pk.startsWith('nsec')) {
    const decoded = nip19.decode(pk);
    if (decoded.type !== 'nsec') throw new Error('invalid nsec');
    return decoded.data as Uint8Array;
  }
  const hex = pk.replace(/^0x/i, '');
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error('NOSTR_PK must be nsec or 64 hex chars');
  return hexToBytes(hex);
}

/** Pay a NIP-57 zap to the author's kind-1 note (bounty payout). */
export async function zapRecipientKind1Note(params: {
  kind1EventId: string;
  amountSats: number;
  recipientLud16: string;
  comment: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  dotenv.config();

  let payerPubkeyHex: string;
  try {
    payerPubkeyHex = getPublicKey(payerSecretKeyBytesFromEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] payer key: ${msg}`);
    return { ok: false, reason: 'nostr_pk_invalid' };
  }

  let meta: Awaited<ReturnType<typeof fetchLnurlPayMetadata>>;
  try {
    meta = await fetchLnurlPayMetadata(params.recipientLud16);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] lnurlp metadata: ${msg}`);
    return { ok: false, reason: 'lnurlp_metadata_failed' };
  }

  if (!meta.allowsNostr || !meta.nostrPubkey) {
    return { ok: false, reason: 'recipient_lnurl_no_zap' };
  }

  const lnurlpHttpsUrl = lud16ToLnurlPayUrl(params.recipientLud16);
  const lnurlBech32 = encodeLnurlBech32(lnurlpHttpsUrl);
  const millisats = params.amountSats * 1000;

  const zapRequestTpl = nip57.makeZapRequest({
    profile: meta.nostrPubkey,
    event: params.kind1EventId,
    amount: millisats,
    relays: NOSTR_RELAYS,
    comment: params.comment.slice(0, 1000),
  });
  zapRequestTpl.tags.push(['lnurl', lnurlBech32]);
  zapRequestTpl.tags.push(['k', '1']);

  let signedZapRequest: Event;
  try {
    signedZapRequest = finalizeEvent(zapRequestTpl, payerSecretKeyBytesFromEnv()) as Event;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] sign 9734: ${msg}`);
    return { ok: false, reason: 'zap_request_sign_failed' };
  }

  let bolt11: string;
  try {
    bolt11 = await fetchZapInvoiceFromCallback(meta.callback, signedZapRequest, lnurlBech32, millisats);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] callback invoice: ${msg}`);
    return { ok: false, reason: 'zap_callback_invoice_failed' };
  }

  try {
    await payInvoice(bolt11);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] payInvoice: ${msg}`);
    return { ok: false, reason: 'zap_invoice_pay_failed' };
  }

  console.log(
    `${dateNow()} [BOUNTY_ZAP] paid ${params.amountSats} sats to ${params.recipientLud16} on kind1=${params.kind1EventId}`
  );
  return { ok: true };
}
