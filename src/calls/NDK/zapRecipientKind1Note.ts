import { hexToBytes } from '@noble/hashes/utils';
import { nip19, nip57, finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
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

/** Give relays a moment to see the kind-1 before LNURL verifies the event id. */
async function waitForKind1OnRelays(eventId: string, timeoutMs = 12_000): Promise<boolean> {
  const pool = new SimplePool();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const events = await pool.querySync([...NOSTR_RELAYS], { ids: [eventId], kinds: [1] });
      if (events.length > 0) return true;
      await new Promise((r) => setTimeout(r, 600));
    }
    return false;
  } finally {
    pool.close([...NOSTR_RELAYS]);
  }
}

/** Pay a NIP-57 zap to the author's kind-1 note (bounty payout). */
export async function zapRecipientKind1Note(params: {
  kind1EventId: string;
  /** Hex pubkey of the kind-1 author (must match published note). */
  kind1AuthorPubkey: string;
  amountSats: number;
  recipientLud16: string;
  comment: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  dotenv.config();

  try {
    getPublicKey(payerSecretKeyBytesFromEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${dateNow()} [BOUNTY_ZAP] payer key: ${msg}`);
    return { ok: false, reason: 'nostr_pk_invalid' };
  }

  const seenOnRelay = await waitForKind1OnRelays(params.kind1EventId);
  if (!seenOnRelay) {
    console.warn(
      `${dateNow()} [BOUNTY_ZAP] kind1=${params.kind1EventId} not seen on relays yet; zapping anyway`
    );
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
    event: kind1EventStub(params.kind1EventId, params.kind1AuthorPubkey),
    amount: millisats,
    relays: [...NOSTR_RELAYS],
    comment: params.comment.slice(0, 1000),
  });
  zapRequestTpl.tags.push(['lnurl', lnurlBech32]);

  const eTag = zapRequestTpl.tags.find((t) => t[0] === 'e');
  const pTag = zapRequestTpl.tags.find((t) => t[0] === 'p');
  if (!eTag?.[1] || !pTag?.[1]) {
    console.error(`${dateNow()} [BOUNTY_ZAP] invalid 9734 tags e=${eTag?.[1] ?? 'missing'} p=${pTag?.[1] ?? 'missing'}`);
    return { ok: false, reason: 'zap_request_tags_invalid' };
  }

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
    `${dateNow()} [BOUNTY_ZAP] paid ${params.amountSats} sats to ${params.recipientLud16} on kind1=${params.kind1EventId} author=${params.kind1AuthorPubkey.slice(0, 12)}…`
  );
  return { ok: true };
}
