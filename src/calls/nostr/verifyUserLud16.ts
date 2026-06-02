import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import { fetchLnurlPayMetadata } from './lnurlZapShared';

export type Lud16VerifyResult = {
  ok: boolean;
  lud16: string | null;
  allowsNostr: boolean;
  nostrPubkeyMatches: boolean;
  reason?: string;
};

export async function verifyUserLud16(pubkey: string): Promise<Lud16VerifyResult> {
  const profile = await fetchNostrAppProfile(pubkey);
  const lud16 = profile.lud16?.trim() || null;
  if (!lud16) {
    return {
      ok: false,
      lud16: null,
      allowsNostr: false,
      nostrPubkeyMatches: false,
      reason: 'lud16_missing',
    };
  }
  try {
    const meta = await fetchLnurlPayMetadata(lud16);
    const allowsNostr = Boolean(meta.allowsNostr && meta.nostrPubkey);
    const nostrPubkeyMatches =
      allowsNostr && meta.nostrPubkey!.toLowerCase() === pubkey.toLowerCase();
    return {
      ok: allowsNostr && nostrPubkeyMatches,
      lud16,
      allowsNostr,
      nostrPubkeyMatches,
      reason: !allowsNostr
        ? 'lnurl_no_zap'
        : !nostrPubkeyMatches
          ? 'lnurl_pubkey_mismatch'
          : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      lud16,
      allowsNostr: false,
      nostrPubkeyMatches: false,
      reason: e instanceof Error ? e.message : 'lnurl_verify_failed',
    };
  }
}
