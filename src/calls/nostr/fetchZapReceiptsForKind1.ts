import { SimplePool, type Event } from 'nostr-tools';
import { ZAP_RECEIPT_RELAYS } from '../../consts/nostrRelays';

/** Query relays for kind-9735 zap receipts tagging a kind-1 note. */
export async function fetchZapReceiptsForKind1(kind1EventId: string): Promise<Event[]> {
  const relays = [...ZAP_RECEIPT_RELAYS];
  const pool = new SimplePool();
  try {
    return await pool.querySync(relays, {
      kinds: [9735],
      '#e': [kind1EventId],
    });
  } finally {
    pool.close(relays);
  }
}
