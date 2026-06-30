import { loadPaidClaimsSync } from '../state/challengeClaimStore';

const prefixToFullPubkey = new Map<string, string>();
let claimsPrefixIndex: Map<string, string> | null = null;

function normalizePrefix(prefix: string): string {
  return prefix.trim().toLowerCase().slice(0, 12);
}

function ensureClaimsPrefixIndex(): Map<string, string> {
  if (!claimsPrefixIndex) {
    claimsPrefixIndex = new Map();
    for (const claim of loadPaidClaimsSync().values()) {
      const prefix = claim.pubkey.slice(0, 12);
      if (!claimsPrefixIndex.has(prefix)) {
        claimsPrefixIndex.set(prefix, claim.pubkey);
      }
    }
  }
  return claimsPrefixIndex;
}

/** Remember full pubkey for a prefix (Nostr sign-in, seat pay, claims). */
export function rememberPubkeyPrefix(pubkey: string): void {
  const pk = pubkey.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pk)) return;
  prefixToFullPubkey.set(pk.slice(0, 12), pk);
}

export function getFullPubkeyForPrefix(pubkeyPrefix: string): string | undefined {
  const prefix = normalizePrefix(pubkeyPrefix);
  if (!/^[0-9a-f]{12}$/.test(prefix)) return undefined;
  return (
    prefixToFullPubkey.get(prefix) ?? ensureClaimsPrefixIndex().get(prefix)
  );
}
