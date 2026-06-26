import type { AppNostrProfile } from '../../state/nostrAppSessionState';

const profileByPubkey = new Map<string, AppNostrProfile>();

export function getCachedNostrProfile(pubkey: string): AppNostrProfile | undefined {
  return profileByPubkey.get(pubkey.toLowerCase());
}

export function setCachedNostrProfile(profile: AppNostrProfile): void {
  profileByPubkey.set(profile.pubkey.toLowerCase(), profile);
}

export function invalidateCachedNostrProfile(pubkey: string): void {
  profileByPubkey.delete(pubkey.trim().toLowerCase());
}
