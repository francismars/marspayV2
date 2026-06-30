import type { PlayerIdentity } from './api';

export function displayName(identity: PlayerIdentity): string {
  if (identity.kind === 'anon') return 'Anonymous';
  if (identity.name?.trim()) return identity.name.trim();
  const nip05 = identity.nip05?.trim();
  if (nip05) {
    const at = nip05.indexOf('@');
    if (at > 0) return nip05.slice(0, at);
    return nip05;
  }
  return 'Nostr player';
}

export function profileUrl(identity: PlayerIdentity): string | null {
  if (identity.kind !== 'nostr' || !identity.npub) return null;
  return `https://njump.me/${identity.npub}`;
}

export function nip05Url(identity: PlayerIdentity): string | null {
  const nip05 = identity.nip05?.trim();
  if (!nip05 || !nip05.includes('@')) return null;
  const domain = nip05.slice(nip05.indexOf('@') + 1);
  if (!domain) return null;
  return `https://${domain}`;
}

export function initials(identity: PlayerIdentity): string {
  const name = displayName(identity);
  if (name === 'Anonymous' || name === 'Nostr player') return 'N';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function technicalId(identity: PlayerIdentity): string | undefined {
  return identity.npub ?? identity.pubkeyPrefix ?? identity.pubkey;
}
