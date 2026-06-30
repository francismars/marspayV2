/**
 * Tier B identity: link pubkeyPrefix to sessionIDs for admin journey queries.
 * In-memory only; not written to events.jsonl as a separate store.
 */

import { rememberPubkeyPrefix } from './pubkeyPrefixLookup';

const pubkeyToSessions = new Map<string, Set<string>>();
const sessionToPubkey = new Map<string, string>();

const MAX_SESSIONS_PER_PUBKEY = 50;

export function linkSessionToPubkey(sessionID: string, pubkey: string): void {
  const pk = pubkey.trim().toLowerCase();
  const prefix = pk.slice(0, 12);
  if (!/^[0-9a-f]{12}$/.test(prefix)) return;

  rememberPubkeyPrefix(pk);

  const prev = sessionToPubkey.get(sessionID);
  if (prev === prefix) return;

  sessionToPubkey.set(sessionID, prefix);

  let sessions = pubkeyToSessions.get(prefix);
  if (!sessions) {
    sessions = new Set();
    pubkeyToSessions.set(prefix, sessions);
  }
  sessions.add(sessionID);

  if (sessions.size > MAX_SESSIONS_PER_PUBKEY) {
    const oldest = sessions.values().next().value;
    if (oldest) {
      sessions.delete(oldest);
      sessionToPubkey.delete(oldest);
    }
  }
}

export function getPubkeyPrefixForSession(sessionID: string): string | undefined {
  return sessionToPubkey.get(sessionID);
}

export function getSessionsForPubkeyPrefix(pubkeyPrefix: string): string[] {
  const normalized = pubkeyPrefix.trim().toLowerCase().slice(0, 12);
  const sessions = pubkeyToSessions.get(normalized);
  return sessions ? [...sessions] : [];
}
