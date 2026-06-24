import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import type { AuthorRelayContext } from './fetchAuthorEvents';

export type NostrProfileLite = {
  pubkey: string;
  name: string;
  picture: string | null;
};

export async function fetchNostrProfileMetadata(
  pubkey: string,
  options?: { relayContext?: AuthorRelayContext }
): Promise<NostrProfileLite> {
  const profile = await fetchNostrAppProfile(pubkey, options);
  return {
    pubkey: profile.pubkey,
    name: profile.name,
    picture: profile.picture,
  };
}
