import { randomBytes } from 'crypto';

/** App-wide Nostr identity bound to socket session (longer than per-room link). */
const APP_NOSTR_TTL_MS = 24 * 60 * 60 * 1000;
const APP_NOSTR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type AppNostrSignerMode = 'extension' | 'nip46' | 'nsec';

export type AppNostrProfile = {
  pubkey: string;
  name: string;
  picture: string | null;
  nip05: string | null;
  lud16: string | null;
  lud06: string | null;
};

export type AppNostrSessionRecord = {
  pubkey: string;
  expiresAt: number;
  signerMode: AppNostrSignerMode | null;
  profile: AppNostrProfile;
};

type PendingChallenge = {
  challenge: string;
  expiresAt: number;
};

const pendingAppNostrChallengeBySession = new Map<string, PendingChallenge>();
const appNostrBySession = new Map<string, AppNostrSessionRecord>();

export function issueAppNostrLinkChallenge(
  sessionID: string
): { challenge: string; expiresAt: number } | undefined {
  if (!sessionID) {
    return undefined;
  }
  const challenge = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + APP_NOSTR_CHALLENGE_TTL_MS;
  pendingAppNostrChallengeBySession.set(sessionID, { challenge, expiresAt });
  return { challenge, expiresAt };
}

export function peekPendingAppNostrChallenge(
  sessionID: string
): { challenge: string } | undefined {
  const p = pendingAppNostrChallengeBySession.get(sessionID);
  if (!p || p.expiresAt <= Date.now()) {
    if (p) {
      pendingAppNostrChallengeBySession.delete(sessionID);
    }
    return undefined;
  }
  return { challenge: p.challenge };
}

export function clearPendingAppNostrChallenge(sessionID: string) {
  pendingAppNostrChallengeBySession.delete(sessionID);
}

export function registerAppNostrSession(
  sessionID: string,
  pubkeyHex: string,
  profile: AppNostrProfile,
  signerMode: AppNostrSignerMode | null
): { expiresAt: number } {
  const pk = pubkeyHex.toLowerCase();
  const expiresAt = Date.now() + APP_NOSTR_TTL_MS;
  appNostrBySession.set(sessionID, {
    pubkey: pk,
    expiresAt,
    signerMode,
    profile: { ...profile, pubkey: pk },
  });
  clearPendingAppNostrChallenge(sessionID);
  return { expiresAt };
}

export function clearAppNostrSession(sessionID: string) {
  appNostrBySession.delete(sessionID);
  clearPendingAppNostrChallenge(sessionID);
}

export function getAppNostrSession(sessionID: string): AppNostrSessionRecord | undefined {
  const rec = appNostrBySession.get(sessionID);
  if (!rec) {
    return undefined;
  }
  if (rec.expiresAt <= Date.now()) {
    appNostrBySession.delete(sessionID);
    return undefined;
  }
  return rec;
}

/** Sliding refresh on activity. */
export function touchAppNostrSession(sessionID: string): void {
  const rec = appNostrBySession.get(sessionID);
  if (!rec || rec.expiresAt <= Date.now()) {
    return;
  }
  rec.expiresAt = Date.now() + APP_NOSTR_TTL_MS;
  appNostrBySession.set(sessionID, rec);
}

export function getAppNostrPubkeyForSession(sessionID: string): string | undefined {
  return getAppNostrSession(sessionID)?.pubkey;
}

/** Replace stored session profile (e.g. after a fresh kind-0 relay read). */
export function syncAppNostrSessionProfile(
  sessionID: string,
  profile: AppNostrProfile
): boolean {
  const rec = getAppNostrSession(sessionID);
  if (!rec) {
    return false;
  }
  const pk = profile.pubkey.trim().toLowerCase();
  if (pk !== rec.pubkey) {
    return false;
  }
  rec.profile = { ...profile, pubkey: rec.pubkey };
  appNostrBySession.set(sessionID, rec);
  return true;
}
