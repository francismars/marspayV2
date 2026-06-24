import { getAppNostrPubkeyForSession } from '../state/nostrAppSessionState';
import { getRoomById } from '../state/onlineRoomState';
import { pubkeyPrefix } from './trackEvent';

/** Resolve pubkey prefix for telemetry from app Nostr session or ONLINE seat. */
export function resolveTrackPubkeyPrefix(
  sessionID?: string,
  roomId?: string
): string | undefined {
  if (!sessionID) return undefined;
  const appPk = getAppNostrPubkeyForSession(sessionID);
  if (appPk) return pubkeyPrefix(appPk);
  if (roomId) {
    const room = getRoomById(roomId);
    if (room) {
      for (const seat of room.seats.values()) {
        if (seat.sessionID === sessionID && seat.pubkey) {
          return pubkeyPrefix(seat.pubkey);
        }
      }
    }
  }
  return undefined;
}
