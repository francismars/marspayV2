/** Public mempool.space mirrors polled server-side only. */
export const MEMPOOL_API_HOSTS = [
  'https://mempool.space',
  'https://mempool.emzy.de',
  'https://mempool.bitaroo.net',
] as const;

export interface MempoolBlockInfo {
  height: number;
  timestamp: number;
  size: number;
  tx_count: number;
  extras?: {
    medianFee?: number;
    pool?: {
      name?: string;
    };
  };
}

/** @deprecated use MempoolBlockInfo */
export type MempoolTipBlock = Pick<MempoolBlockInfo, 'height' | 'extras'>;

export interface MempoolTipBlockResult {
  block: MempoolBlockInfo;
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

function isValidBlock(block: unknown): block is MempoolBlockInfo {
  if (!block || typeof block !== 'object') return false;
  const b = block as MempoolBlockInfo;
  return (
    typeof b.height === 'number' &&
    Number.isFinite(b.height) &&
    typeof b.timestamp === 'number'
  );
}

async function fetchBlockFromHost(host: string): Promise<MempoolBlockInfo | null> {
  const tipHash = (await fetchText(`${host}/api/blocks/tip/hash`)).trim();
  if (!tipHash) return null;
  const block = (await fetchJson(`${host}/api/v1/block/${tipHash}`)) as MempoolBlockInfo;
  return isValidBlock(block) ? block : null;
}

export async function fetchLatestMempoolBlock(
  hosts: readonly string[] = resolveMempoolApiHosts()
): Promise<MempoolBlockInfo | null> {
  const result = await fetchLatestMempoolTipBlock(hosts);
  return result?.block ?? null;
}

export async function fetchLatestMempoolTipBlock(
  hosts: readonly string[] = resolveMempoolApiHosts()
): Promise<MempoolTipBlockResult | null> {
  for (const host of hosts) {
    try {
      const block = await fetchBlockFromHost(host);
      if (block) {
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
