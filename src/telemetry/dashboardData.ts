import fs from 'fs';
import path from 'path';

function tailJsonl(filePath: string, limit: number): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const slice = lines.slice(-limit);
  const rows: unknown[] = [];
  for (const line of slice) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return rows;
}

export function tailChallengeClaims(limit = 20): unknown[] {
  const filePath = path.join(process.cwd(), 'data', 'challenge_claims', 'claims.jsonl');
  return tailJsonl(filePath, limit);
}

export function tailOnlineArchiveIndex(limit = 20): unknown[] {
  const filePath = path.join(process.cwd(), 'data', 'online_archive', 'index.jsonl');
  return tailJsonl(filePath, limit);
}
