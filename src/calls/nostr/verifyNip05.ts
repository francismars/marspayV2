/** NIP-05: verify identifier maps to pubkey via domain well-known. */
export async function verifyNip05(pubkeyHex: string, nip05Raw: string): Promise<boolean> {
  const trimmed = nip05Raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain) return false;

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return false;
    const j = (await r.json()) as { names?: Record<string, string> };
    const names = j.names;
    if (!names || typeof names !== 'object') return false;
    let mapped = names[local];
    if (typeof mapped !== 'string') {
      const key = Object.keys(names).find((k) => k.toLowerCase() === local);
      mapped = key ? names[key] : '';
    }
    if (typeof mapped !== 'string') return false;
    return mapped.replace(/^0x/i, '').toLowerCase() === pubkeyHex.toLowerCase();
  } catch {
    return false;
  }
}
