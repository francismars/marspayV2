import { nip19 } from 'nostr-tools';
import {
  findCachedProfileByPrefix,
  getCachedNostrProfile,
} from '../calls/nostr/nostrProfileCache';
import {
  findAppNostrSessionByPubkeyPrefix,
  getAppNostrSession,
  type AppNostrProfile,
  type AppNostrSessionRecord,
} from '../state/nostrAppSessionState';
import { pubkeyPrefix as toPubkeyPrefix } from './trackEvent';
import { getFullPubkeyForPrefix } from './pubkeyPrefixLookup';

export type PlayerIdentity = {
  kind: 'nostr' | 'anon';
  pubkey?: string;
  npub?: string;
  name?: string;
  picture?: string | null;
  nip05?: string | null;
  lud16?: string | null;
  signerMode?: 'extension' | 'nip46' | 'nsec' | null;
  pubkeyPrefix?: string;
};

function nostrFromApp(app: AppNostrSessionRecord): PlayerIdentity {
  return {
    kind: 'nostr',
    pubkey: app.pubkey,
    npub: nip19.npubEncode(app.pubkey),
    name: app.profile.name,
    picture: app.profile.picture,
    nip05: app.profile.nip05,
    lud16: app.profile.lud16,
    signerMode: app.signerMode,
    pubkeyPrefix: toPubkeyPrefix(app.pubkey),
  };
}

function nostrFromProfile(
  profile: AppNostrProfile,
  signerMode?: AppNostrSessionRecord['signerMode']
): PlayerIdentity {
  return {
    kind: 'nostr',
    pubkey: profile.pubkey,
    npub: nip19.npubEncode(profile.pubkey),
    name: profile.name,
    picture: profile.picture,
    nip05: profile.nip05,
    lud16: profile.lud16,
    signerMode: signerMode ?? null,
    pubkeyPrefix: toPubkeyPrefix(profile.pubkey),
  };
}

export function resolvePlayerIdentity(input: {
  sessionID?: string;
  pubkey?: string;
  pubkeyPrefix?: string;
  name?: string;
  picture?: string;
}): PlayerIdentity {
  if (input.sessionID) {
    const app = getAppNostrSession(input.sessionID);
    if (app) return nostrFromApp(app);
  }

  const pubkeyHex = input.pubkey?.trim().toLowerCase();
  if (pubkeyHex && /^[0-9a-f]{64}$/.test(pubkeyHex)) {
    const cached = getCachedNostrProfile(pubkeyHex);
    if (cached) return nostrFromProfile(cached);
    return {
      kind: 'nostr',
      pubkey: pubkeyHex,
      npub: nip19.npubEncode(pubkeyHex),
      name: 'Nostr player',
      pubkeyPrefix: toPubkeyPrefix(pubkeyHex),
    };
  }

  const prefix = input.pubkeyPrefix?.trim().toLowerCase();
  if (prefix) {
    const cached = findCachedProfileByPrefix(prefix);
    if (cached) return nostrFromProfile(cached);
    const app = findAppNostrSessionByPubkeyPrefix(prefix);
    if (app) return nostrFromApp(app);
    const fullPk = getFullPubkeyForPrefix(prefix);
    if (fullPk) {
      const cachedFull = getCachedNostrProfile(fullPk);
      if (cachedFull) return nostrFromProfile(cachedFull);
      return {
        kind: 'nostr',
        pubkey: fullPk,
        npub: nip19.npubEncode(fullPk),
        name: 'Nostr player',
        pubkeyPrefix: toPubkeyPrefix(fullPk),
      };
    }
  }

  if (input.name || input.picture) {
    return {
      kind: 'nostr',
      name: input.name ?? 'Nostr player',
      picture: input.picture ?? null,
      pubkeyPrefix: prefix,
    };
  }

  if (prefix) {
    return { kind: 'nostr', name: 'Nostr player', pubkeyPrefix: prefix };
  }

  return { kind: 'anon', pubkeyPrefix: undefined };
}
