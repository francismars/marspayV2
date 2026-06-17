/** Keep in sync with chain-duel-react `src/game/io/mempool.ts` `MEMPOOL_API_HOSTS`. */
export const MEMPOOL_API_HOSTS = [
  'https://mempool.space',
  'https://mempool.emzy.de',
  'https://mempool.bitaroo.net',
] as const;

export interface MempoolTipBlock {
  height: number;
  extras?: { medianFee?: number };
}

export interface MempoolTipBlockResult {
  block: MempoolTipBlock;
  host: string;
}

const FETCH_TIMEOUT_MS = 10_000;

export function resolveMempoolApiHosts(): string[] {
  const custom = process.env.MEMPOOL_HOST?.trim();
  const hosts = [...MEMPOOL_API_HOSTS];
  if (!custom) {
    return hosts;
  }
  const normalized = custom.replace(/\/$/, '');
  return [normalized, ...hosts.filter((host) => host !== normalized)];
}

export async function fetchLatestMempoolTipBlock(
  hosts: readonly string[] = resolveMempoolApiHosts()
): Promise<MempoolTipBlockResult | null> {
  for (const host of hosts) {
    try {
      const tipHash = (await fetchText(`${host}/api/blocks/tip/hash`)).trim();
      if (!tipHash) {
        continue;
      }
      const block = (await fetchJson(
        `${host}/api/v1/block/${tipHash}`
      )) as MempoolTipBlock;
      if (typeof block?.height === 'number' && Number.isFinite(block.height)) {
        return { block, host };
      }
    } catch {
      // try next host
    }
  }
  return null;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.json();
}
