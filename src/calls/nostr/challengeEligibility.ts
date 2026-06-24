import { verifyNip05 } from './verifyNip05';
import {
  countKind3Follows,
  fetchKind3ContactList,
  kind3FollowsPubkey,
} from './fetchKind3ContactList';
import { fetchAccountAge, MIN_ACCOUNT_AGE_DAYS } from './fetchAccountAge';
import { verifyUserLud16 } from './verifyUserLud16';
import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import { fetchAuthorRelayContext } from './fetchAuthorEvents';

export const MIN_FOLLOWING_COUNT = 100;

export type EligibilityCheck = {
  pass: boolean;
  detail?: string;
};

export type ChallengeEligibilityChecks = {
  nip05: EligibilityCheck;
  followingCount: EligibilityCheck & { count?: number };
  followsChainduel: EligibilityCheck;
  accountAge: EligibilityCheck & { ageDays?: number | null };
  lud16: EligibilityCheck & { address?: string | null };
  appSession: EligibilityCheck;
};

export type ChallengeEligibilityResult = {
  ok: boolean;
  pubkey: string | null;
  checks: ChallengeEligibilityChecks;
  eligible: boolean;
};

type CacheEntry = { result: ChallengeEligibilityResult; expiresAt: number };
const cacheByPubkey = new Map<string, CacheEntry>();
const ELIGIBLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INELIGIBLE_CACHE_TTL_MS = 5 * 60 * 1000;

function chainduelPubkey(): string | null {
  const raw = process.env.CHAINDUEL_NOSTR_PUBKEY?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{64}$/.test(raw) ? raw : null;
}

export async function evaluateChallengeEligibility(
  pubkey: string | null | undefined,
  hasAppSession: boolean,
  options?: { forceRefresh?: boolean }
): Promise<ChallengeEligibilityResult> {
  const hex = typeof pubkey === 'string' ? pubkey.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return {
      ok: false,
      pubkey: null,
      eligible: false,
      checks: {
        nip05: { pass: false, detail: 'not_signed_in' },
        followingCount: { pass: false, detail: 'not_signed_in' },
        followsChainduel: { pass: false, detail: 'not_signed_in' },
        accountAge: { pass: false, detail: 'not_signed_in' },
        lud16: { pass: false, detail: 'not_signed_in' },
        appSession: { pass: hasAppSession, detail: hasAppSession ? undefined : 'no_app_session' },
      },
    };
  }

  if (options?.forceRefresh) {
    invalidateEligibilityCache(hex);
  }

  const cached = cacheByPubkey.get(hex);
  if (cached && cached.expiresAt > Date.now()) {
    const c = cached.result;
    const appSession: EligibilityCheck = {
      pass: hasAppSession,
      detail: hasAppSession ? undefined : 'no_app_session',
    };
    const eligible =
      hasAppSession &&
      c.checks.nip05.pass &&
      c.checks.followingCount.pass &&
      c.checks.followsChainduel.pass &&
      c.checks.accountAge.pass &&
      c.checks.lud16.pass;
    return { ...c, checks: { ...c.checks, appSession }, eligible };
  }

  const relayContext = await fetchAuthorRelayContext(hex);

  const [profile, kind3, accountAge, lud16Result] = await Promise.all([
    fetchNostrAppProfile(hex, { relayContext }),
    fetchKind3ContactList(hex, { relayContext }),
    fetchAccountAge(hex, { relayContext }),
    verifyUserLud16(hex),
  ]);

  const followingCount = countKind3Follows(kind3);
  const cdPk = chainduelPubkey();
  const followsCd = cdPk ? kind3FollowsPubkey(kind3, cdPk) : false;

  let nip05Pass = false;
  if (profile.nip05) {
    nip05Pass = await verifyNip05(hex, profile.nip05);
  }

  const checks: ChallengeEligibilityChecks = {
    nip05: {
      pass: nip05Pass,
      detail: nip05Pass ? undefined : profile.nip05 ? 'nip05_mismatch' : 'nip05_missing',
    },
    followingCount: {
      pass: followingCount >= MIN_FOLLOWING_COUNT,
      count: followingCount,
      detail:
        followingCount >= MIN_FOLLOWING_COUNT
          ? undefined
          : `need_${MIN_FOLLOWING_COUNT}_follows`,
    },
    followsChainduel: {
      pass: cdPk ? followsCd : true,
      detail: !cdPk ? 'chainduel_pubkey_unconfigured' : followsCd ? undefined : 'not_following_chainduel',
    },
    accountAge: {
      pass: accountAge.meetsMinimum,
      ageDays: accountAge.ageDays,
      detail: accountAge.meetsMinimum
        ? undefined
        : accountAge.ok
          ? `need_${MIN_ACCOUNT_AGE_DAYS}_days`
          : 'no_relay_history',
    },
    lud16: {
      pass: lud16Result.ok,
      address: lud16Result.lud16,
      detail: lud16Result.ok ? undefined : lud16Result.reason ?? 'lud16_invalid',
    },
    appSession: {
      pass: hasAppSession,
      detail: hasAppSession ? undefined : 'no_app_session',
    },
  };

  const eligible =
    hasAppSession &&
    checks.nip05.pass &&
    checks.followingCount.pass &&
    checks.followsChainduel.pass &&
    checks.accountAge.pass &&
    checks.lud16.pass;

  const result: ChallengeEligibilityResult = {
    ok: true,
    pubkey: hex,
    checks,
    eligible,
  };

  const cacheTtl = eligible ? ELIGIBLE_CACHE_TTL_MS : INELIGIBLE_CACHE_TTL_MS;
  cacheByPubkey.set(hex, { result, expiresAt: Date.now() + cacheTtl });
  return result;
}

export function invalidateEligibilityCache(pubkey: string): void {
  cacheByPubkey.delete(pubkey.toLowerCase());
}
