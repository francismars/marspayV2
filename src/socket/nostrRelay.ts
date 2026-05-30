import { Socket } from 'socket.io';
import { verifyEvent, type Event } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { fetchNostrAppProfile } from '../calls/nostr/fetchNostrAppProfile';
import { ndkInstance, setNDKInstance } from '../calls/NDK/setNDKInstance';
import { getAppNostrSession } from '../state/nostrAppSessionState';

export async function getNostrProfileHandler(
  socket: Socket,
  payload: { pubkey?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  let pubkey = typeof payload?.pubkey === 'string' ? payload.pubkey.trim().toLowerCase() : '';
  if (!pubkey && sessionID) {
    pubkey = getAppNostrSession(sessionID)?.pubkey ?? '';
  }
  if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) {
    socket.emit('resNostrProfile', { ok: false, reason: 'invalid_pubkey' });
    return;
  }
  try {
    const profile = await fetchNostrAppProfile(pubkey);
    socket.emit('resNostrProfile', { ok: true, profile });
  } catch (e) {
    socket.emit('resNostrProfile', {
      ok: false,
      reason: e instanceof Error ? e.message : 'profile_fetch_failed',
    });
  }
}

export async function publishSignedNostrEventHandler(
  socket: Socket,
  payload: { event: unknown }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  const ev = payload?.event;
  if (!ev || typeof ev !== 'object') {
    socket.emit('resPublishNostrEvent', { ok: false, reason: 'invalid_event' });
    return;
  }
  if (!verifyEvent(ev as Event)) {
    socket.emit('resPublishNostrEvent', { ok: false, reason: 'invalid_signature' });
    return;
  }
  const event = ev as Event;
  const appSession = sessionID ? getAppNostrSession(sessionID) : undefined;
  if (appSession && event.pubkey.toLowerCase() !== appSession.pubkey) {
    socket.emit('resPublishNostrEvent', { ok: false, reason: 'pubkey_mismatch' });
    return;
  }
  if (!ndkInstance) {
    try {
      await setNDKInstance();
    } catch (e) {
      socket.emit('resPublishNostrEvent', {
        ok: false,
        reason: e instanceof Error ? e.message : 'ndk_unavailable',
      });
      return;
    }
  }
  try {
    const ndkEvent = new NDKEvent(ndkInstance, event);
    await ndkEvent.publish();
    socket.emit('resPublishNostrEvent', { ok: true, eventId: event.id });
  } catch (e) {
    socket.emit('resPublishNostrEvent', {
      ok: false,
      reason: e instanceof Error ? e.message : 'publish_failed',
    });
  }
}
