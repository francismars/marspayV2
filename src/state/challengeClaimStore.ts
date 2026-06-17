/**
 * Persists paid challenge bounty claims and daily zap spend across server restarts.
 */
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

const CLAIMS_FILE = 'claims.jsonl';
const DAILY_FILE = 'daily_spend.json';

export type StoredChallengeClaim = {
  version: 1;
  pubkey: string;
  challengeId: string;
  runId: string;
  kind1EventId: string | null;
  bountySats: number;
  publishedAt: number | null;
  zapPaidAt: number | null;
  zapComment: string | null;
};

function storeDir(): string {
  return path.join(process.cwd(), 'data', 'challenge_claims');
}

function claimKey(pubkey: string, challengeId: string): string {
  return `${pubkey.toLowerCase()}:${challengeId}`;
}

function ensureDirSync(): void {
  fs.mkdirSync(storeDir(), { recursive: true });
}

function parseClaimLine(line: string): StoredChallengeClaim | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const row = JSON.parse(trimmed) as StoredChallengeClaim;
    if (row.version !== 1) return null;
    if (!row.pubkey || !row.challengeId || !row.zapPaidAt) return null;
    return { ...row, pubkey: row.pubkey.toLowerCase() };
  } catch {
    return null;
  }
}

/** Boot: read claims.jsonl into a map keyed by pubkey:challengeId. */
export function loadPaidClaimsSync(): Map<string, StoredChallengeClaim> {
  const map = new Map<string, StoredChallengeClaim>();
  const filePath = path.join(storeDir(), CLAIMS_FILE);
  if (!fs.existsSync(filePath)) return map;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const row = parseClaimLine(line);
    if (!row) continue;
    map.set(claimKey(row.pubkey, row.challengeId), row);
  }
  return map;
}

/** After a successful zap: append one JSON line (append-only). */
export async function appendPaidClaim(claim: StoredChallengeClaim): Promise<void> {
  try {
    ensureDirSync();
    const filePath = path.join(storeDir(), CLAIMS_FILE);
    const line =
      JSON.stringify({
        version: 1,
        pubkey: claim.pubkey.toLowerCase(),
        challengeId: claim.challengeId,
        runId: claim.runId,
        kind1EventId: claim.kind1EventId,
        bountySats: claim.bountySats,
        publishedAt: claim.publishedAt,
        zapPaidAt: claim.zapPaidAt,
        zapComment: claim.zapComment,
      }) + '\n';
    await fsPromises.appendFile(filePath, line, 'utf8');
  } catch (e) {
    console.error('[challenge_claims] append failed', e);
  }
}

export function loadDailySpendSync(): Record<string, number> {
  const filePath = path.join(storeDir(), DAILY_FILE);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [day, value] of Object.entries(raw)) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) out[day] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadDailySpendForDaySync(dayKey: string): number {
  return loadDailySpendSync()[dayKey] ?? 0;
}

export async function recordDailySpendPersisted(dayKey: string, sats: number): Promise<void> {
  try {
    ensureDirSync();
    const filePath = path.join(storeDir(), DAILY_FILE);
    const all = loadDailySpendSync();
    all[dayKey] = (all[dayKey] ?? 0) + sats;
    await fsPromises.writeFile(filePath, JSON.stringify(all), 'utf8');
  } catch (e) {
    console.error('[challenge_claims] daily spend persist failed', e);
  }
}
