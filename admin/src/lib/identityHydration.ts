import type { PlayerIdentity } from './api';
import { resolvePlayerIdentities } from './api';
import { needsProfileHydration } from './playerDisplay';

type Pending = {
  pubkey?: string;
  pubkeyPrefix?: string;
  waiters: Array<(identity: PlayerIdentity) => void>;
};

const pending = new Map<string, Pending>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function queueKey(pubkey?: string, pubkeyPrefix?: string): string {
  return pubkey ?? pubkeyPrefix ?? '';
}

function flushQueue(): void {
  flushTimer = null;
  const batch = [...pending.entries()];
  pending.clear();
  if (batch.length === 0) return;

  const items = batch.map(([, entry]) => ({
    pubkey: entry.pubkey,
    pubkeyPrefix: entry.pubkeyPrefix,
  }));

  void resolvePlayerIdentities(items)
    .then((result) => {
      batch.forEach(([, entry], i) => {
        const resolved = result.identities[i] ?? { kind: 'anon' as const };
        for (const waiter of entry.waiters) waiter(resolved);
      });
    })
    .catch(() => {
      for (const [, entry] of batch) {
        const fallback: PlayerIdentity = {
          kind: 'nostr',
          name: 'Nostr player',
          pubkey: entry.pubkey,
          pubkeyPrefix: entry.pubkeyPrefix,
        };
        for (const waiter of entry.waiters) waiter(fallback);
      }
    });
}

export function hydrateIdentity(identity: PlayerIdentity): Promise<PlayerIdentity> {
  if (!needsProfileHydration(identity)) {
    return Promise.resolve(identity);
  }
  const key = queueKey(identity.pubkey, identity.pubkeyPrefix);
  if (!key) return Promise.resolve(identity);

  return new Promise((resolve) => {
    let entry = pending.get(key);
    if (!entry) {
      entry = {
        pubkey: identity.pubkey,
        pubkeyPrefix: identity.pubkeyPrefix,
        waiters: [],
      };
      pending.set(key, entry);
    }
    entry.waiters.push(resolve);
    if (!flushTimer) {
      flushTimer = setTimeout(flushQueue, 50);
    }
  });
}
