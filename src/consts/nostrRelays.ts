export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nos.social',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
  // Indexers — fresh kind-3 contact lists often only reach these relays.
  'wss://purplepag.es',
  'wss://relay.ditto.pub',
];

/** Relays listed in kind-9734 `relays` tag — where the LNURL server publishes kind-9735 receipts. */
export const ZAP_RECEIPT_RELAYS = [
  'wss://relay.primal.net',
  'wss://premium.primal.net',
  'wss://relay.zapstore.dev',
  ...NOSTR_RELAYS.filter(
    (r) =>
      r !== 'wss://relay.primal.net'
  ),
];
