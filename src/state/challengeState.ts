import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

export type ChallengeCatalogEntry = {
  id: string;
  rank: number;
  name: string;
  format: '1v1' | '4P FFA';
  aiTier: 'normie' | 'stacker' | 'noderunner' | 'sovereign';
  powerup: boolean;
  bountySats: number;
};

/** Server source of truth for practice challenge bounties. */
export const CHALLENGE_CATALOG: ChallengeCatalogEntry[] = [
  { id: 'normie', rank: 1, name: 'NORMIE DUEL', format: '1v1', aiTier: 'normie', powerup: false, bountySats: 21 },
  { id: 'stacker', rank: 2, name: 'STACKER TRIAL', format: '1v1', aiTier: 'stacker', powerup: false, bountySats: 210 },
  { id: 'noderunner', rank: 3, name: 'NODE RUNNER', format: '1v1', aiTier: 'noderunner', powerup: true, bountySats: 420 },
  { id: 'gauntlet', rank: 4, name: 'SOVEREIGN GAUNTLET', format: '1v1', aiTier: 'sovereign', powerup: false, bountySats: 1337 },
  { id: 'ffa', rank: 5, name: 'FFA RUMBLE', format: '4P FFA', aiTier: 'noderunner', powerup: false, bountySats: 2100 },
  { id: 'sovereign-stack', rank: 6, name: 'SOVEREIGN STACK', format: '1v1', aiTier: 'sovereign', powerup: true, bountySats: 4200 },
];

export function getChallengeById(id: string): ChallengeCatalogEntry | undefined {
  return CHALLENGE_CATALOG.find((c) => c.id === id);
}

export function isAnonymousRunPubkey(pubkey: string): boolean {
  return !pubkey || pubkey.startsWith('anon:');
}

export function anonymousRunPubkey(sessionID: string): string {
  return `anon:${sessionID}`;
}

export type ChallengeInputEntry = { tick: number; dir: string };

export type ChallengeRunRecord = {
  runId: string;
  pubkey: string;
  sessionID: string;
  challengeId: string;
  seed: string;
  bountySats: number;
  config: ChallengeCatalogEntry;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'won' | 'expired' | 'failed';
  inputLog?: ChallengeInputEntry[];
  countdownStartTick?: number;
};

export type ClaimTokenRecord = {
  token: string;
  runId: string;
  pubkey: string;
  challengeId: string;
  bountySats: number;
  noteContent: string;
  noteTags: string[][];
  expiresAt: number;
  used: boolean;
};

export type ChallengeClaimRecord = {
  pubkey: string;
  challengeId: string;
  runId: string;
  kind1EventId: string | null;
  bountySats: number;
  publishedAt: number | null;
  zapPaidAt: number | null;
  zapComment: string | null;
};

const runsById = new Map<string, ChallengeRunRecord>();
const claimTokensByToken = new Map<string, ClaimTokenRecord>();
const claimsByKey = new Map<string, ChallengeClaimRecord>();

const RUN_TTL_MS = 30 * 60 * 1000;
const CLAIM_TOKEN_TTL_MS = 10 * 60 * 1000;

function claimKey(pubkey: string, challengeId: string): string {
  return `${pubkey.toLowerCase()}:${challengeId}`;
}

export function createChallengeRun(params: {
  pubkey?: string | null;
  sessionID: string;
  challengeId: string;
}): ChallengeRunRecord | { error: string } {
  const challenge = getChallengeById(params.challengeId);
  if (!challenge) return { error: 'unknown_challenge' };

  const pubkey =
    typeof params.pubkey === 'string' && params.pubkey.trim()
      ? params.pubkey.trim().toLowerCase()
      : anonymousRunPubkey(params.sessionID);

  if (!isAnonymousRunPubkey(pubkey)) {
    const existing = claimsByKey.get(claimKey(pubkey, params.challengeId));
    if (existing?.zapPaidAt) return { error: 'already_claimed' };
  }

  const seed = randomBytes(32).toString('hex');
  const now = Date.now();
  const run: ChallengeRunRecord = {
    runId: nanoid(21),
    pubkey,
    sessionID: params.sessionID,
    challengeId: params.challengeId,
    seed,
    bountySats: challenge.bountySats,
    config: challenge,
    createdAt: now,
    expiresAt: now + RUN_TTL_MS,
    status: 'active',
  };
  runsById.set(run.runId, run);
  return run;
}

export function getChallengeRun(runId: string): ChallengeRunRecord | undefined {
  const run = runsById.get(runId);
  if (!run) return undefined;
  if (run.expiresAt < Date.now() && run.status === 'active') {
    run.status = 'expired';
  }
  return run;
}

export function markRunWon(
  runId: string,
  inputLog: ChallengeInputEntry[],
  countdownStartTick: number
): ChallengeRunRecord | undefined {
  const run = getChallengeRun(runId);
  if (!run || run.status !== 'active') return undefined;
  run.inputLog = inputLog;
  run.countdownStartTick = countdownStartTick;
  run.status = 'won';
  return run;
}

export function createClaimToken(params: {
  run: ChallengeRunRecord;
  noteContent: string;
  noteTags: string[][];
}): ClaimTokenRecord {
  const token = nanoid(32);
  const record: ClaimTokenRecord = {
    token,
    runId: params.run.runId,
    pubkey: params.run.pubkey,
    challengeId: params.run.challengeId,
    bountySats: params.run.bountySats,
    noteContent: params.noteContent,
    noteTags: params.noteTags,
    expiresAt: Date.now() + CLAIM_TOKEN_TTL_MS,
    used: false,
  };
  claimTokensByToken.set(token, record);
  return record;
}

export function consumeClaimToken(token: string): ClaimTokenRecord | undefined {
  const rec = claimTokensByToken.get(token);
  if (!rec || rec.used || rec.expiresAt < Date.now()) return undefined;
  rec.used = true;
  return rec;
}

export function hasClaimedChallenge(pubkey: string, challengeId: string): boolean {
  const c = claimsByKey.get(claimKey(pubkey, challengeId));
  return Boolean(c?.zapPaidAt);
}

export function getChallengeClaim(pubkey: string, challengeId: string): ChallengeClaimRecord | undefined {
  return claimsByKey.get(claimKey(pubkey, challengeId));
}

export function upsertChallengeClaim(
  partial: Omit<ChallengeClaimRecord, 'pubkey' | 'challengeId'> & {
    pubkey: string;
    challengeId: string;
  }
): ChallengeClaimRecord {
  const key = claimKey(partial.pubkey, partial.challengeId);
  const prev = claimsByKey.get(key);
  const next: ChallengeClaimRecord = {
    pubkey: partial.pubkey.toLowerCase(),
    challengeId: partial.challengeId,
    runId: partial.runId,
    kind1EventId: partial.kind1EventId ?? prev?.kind1EventId ?? null,
    bountySats: partial.bountySats,
    publishedAt: partial.publishedAt ?? prev?.publishedAt ?? null,
    zapPaidAt: partial.zapPaidAt ?? prev?.zapPaidAt ?? null,
    zapComment: partial.zapComment ?? prev?.zapComment ?? null,
  };
  claimsByKey.set(key, next);
  return next;
}

let dailyZapTotalSats = 0;
let dailyZapDayKey = '';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyZapBudgetRemaining(): number {
  const cap = Math.max(0, Number(process.env.CHALLENGE_BOUNTY_DAILY_CAP_SATS ?? 100_000));
  const key = todayKey();
  if (key !== dailyZapDayKey) {
    dailyZapDayKey = key;
    dailyZapTotalSats = 0;
  }
  return Math.max(0, cap - dailyZapTotalSats);
}

export function recordDailyZapSpend(sats: number): void {
  const key = todayKey();
  if (key !== dailyZapDayKey) {
    dailyZapDayKey = key;
    dailyZapTotalSats = 0;
  }
  dailyZapTotalSats += sats;
}

export function listPendingZapClaims(): ChallengeClaimRecord[] {
  return [...claimsByKey.values()].filter((c) => c.publishedAt && !c.zapPaidAt);
}
