import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import { fetchLnurlPayMetadata } from './lnurlZapShared';

export type Lud16VerifyResult = {
  ok: boolean;
  lud16: string | null;
  allowsNostr: boolean;
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
      reason: 'lud16_missing',
    };
  }
  try {
    const meta = await fetchLnurlPayMetadata(lud16);
    const allowsNostr = Boolean(meta.allowsNostr && meta.nostrPubkey);
    return {
      ok: allowsNostr,
      lud16,
      allowsNostr,
      reason: allowsNostr ? undefined : 'lnurl_no_zap',
    };
  } catch (e) {
    return {
      ok: false,
      lud16,
      allowsNostr: false,
      reason: e instanceof Error ? e.message : 'lnurl_verify_failed',
    };
  }
}
