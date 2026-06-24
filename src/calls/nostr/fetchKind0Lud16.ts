import type { AuthorRelayContext } from './fetchAuthorEvents';
import { fetchNostrAppProfile } from './fetchNostrAppProfile';

/** Reads `lud16` from the author's latest kind 0 profile JSON (NIP-57 / LUD-16). */
export async function fetchKind0Lud16(
  pubkey: string,
  options?: { relayContext?: AuthorRelayContext }
): Promise<string | undefined> {
  const profile = await fetchNostrAppProfile(pubkey, options);
  const lud16 = profile.lud16?.trim() ?? '';
  if (lud16.includes('@')) {
    return lud16;
  }
  return undefined;
}
