type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function envLimit(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function consume(key: string, limit: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function checkChallengeRunRateLimit(sessionID: string): boolean {
  const limit = envLimit('CHALLENGE_RUN_RATE_LIMIT_PER_MIN', 12);
  return consume(`challenge:run:${sessionID}`, limit);
}

export function checkChallengeSubmitRateLimit(sessionID: string): boolean {
  const limit = envLimit('CHALLENGE_SUBMIT_RATE_LIMIT_PER_MIN', 30);
  return consume(`challenge:submit:${sessionID}`, limit);
}
