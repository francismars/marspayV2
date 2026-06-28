import { Socket } from 'socket.io';
import { verifyEvent, type Event } from 'nostr-tools';
import { fetchNostrAppProfile } from '../calls/nostr/fetchNostrAppProfile';
import {
  clearAppNostrSession,
  getAppNostrSession,
  issueAppNostrLinkChallenge,
  peekPendingAppNostrChallenge,
  registerAppNostrSession,
  touchAppNostrSession,
  type AppNostrSignerMode,
} from '../state/nostrAppSessionState';
import { pubkeyPrefix, trackEvent, trackReject } from '../telemetry/trackEvent';
import { linkSessionToPubkey } from '../telemetry/sessionIdentity';

export type ResAppNostrSessionPayload = {
  ok: boolean;
  pubkey?: string;
  expiresAt?: number;
  signerMode?: AppNostrSignerMode | null;
  profile?: {
    pubkey: string;
    name: string;
    picture: string | null;
    nip05: string | null;
    lud16: string | null;
    lud06: string | null;
  };
  reason?: string;
};

export function serializeAppNostrSession(sessionID: string): ResAppNostrSessionPayload {
  const rec = getAppNostrSession(sessionID);
  if (!rec) {
    return { ok: false };
  }
  touchAppNostrSession(sessionID);
  return {
    ok: true,
    pubkey: rec.pubkey,
    expiresAt: rec.expiresAt,
    signerMode: rec.signerMode,
    profile: rec.profile,
  };
}

export function emitAppNostrSession(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  socket.emit('resAppNostrSession', serializeAppNostrSession(sessionID));
}

export function requestAppNostrLinkChallengeHandler(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const issued = issueAppNostrLinkChallenge(sessionID);
  if (!issued) {
    socket.emit('resAppNostrSession', { ok: false, reason: 'challenge_denied' });
    return;
  }
  socket.emit('resAppNostrLinkChallenge', {
    challenge: issued.challenge,
    expiresAt: issued.expiresAt,
  });
}

export async function confirmAppNostrLinkHandler(
  socket: Socket,
  payload: { event: unknown; signerMode?: AppNostrSignerMode | null }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const ev = payload?.event;
  if (!ev || typeof ev !== 'object') {
    trackReject('nostr.app.link', 'invalid_event', { sessionID });
    socket.emit('resAppNostrSession', { ok: false, reason: 'invalid_event' });
    return;
  }
  if (!verifyEvent(ev as Event)) {
    trackReject('nostr.app.link', 'invalid_signature', { sessionID });
    socket.emit('resAppNostrSession', { ok: false, reason: 'invalid_signature' });
    return;
  }
  const event = ev as Event;
  if (event.kind !== 1) {
    trackReject('nostr.app.link', 'invalid_kind', { sessionID });
    socket.emit('resAppNostrSession', { ok: false, reason: 'invalid_kind' });
    return;
  }
  const pending = peekPendingAppNostrChallenge(sessionID);
  if (!pending || pending.challenge !== event.content.trim()) {
    trackReject('nostr.app.link', 'challenge_mismatch', { sessionID });
    socket.emit('resAppNostrSession', { ok: false, reason: 'challenge_mismatch' });
    return;
  }
  let profile;
  try {
    profile = await fetchNostrAppProfile(event.pubkey);
  } catch {
    profile = {
      pubkey: event.pubkey,
      name: `${event.pubkey.slice(0, 12)}…`,
      picture: null,
      nip05: null,
      lud16: null,
      lud06: null,
    };
  }
  const signerMode =
    payload?.signerMode === 'extension' ||
    payload?.signerMode === 'nip46' ||
    payload?.signerMode === 'nsec'
      ? payload.signerMode
      : null;
  const { expiresAt } = registerAppNostrSession(sessionID, event.pubkey, profile, signerMode);
  const prefix = pubkeyPrefix(event.pubkey);
  if (prefix) {
    linkSessionToPubkey(sessionID, event.pubkey);
  }
  trackEvent({
    event: 'nostr.app.link',
    outcome: 'ok',
    sessionID,
    pubkeyPrefix: prefix,
    meta: { signerMode: signerMode ?? 'unknown' },
  });
  socket.emit('resAppNostrSession', {
    ok: true,
    pubkey: event.pubkey.toLowerCase(),
    expiresAt,
    signerMode,
    profile,
  });
}

export function getAppNostrSessionHandler(socket: Socket) {
  emitAppNostrSession(socket);
}

export function clearAppNostrSessionHandler(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  clearAppNostrSession(sessionID);
  socket.emit('resAppNostrSession', { ok: false });
}
