import { getRoomById } from '../state/onlineRoomState';

/** Public Chain Duel game origin for links in Nostr Kind1 notes (no trailing slash). */
const GAME_PUBLIC_URL_DEFAULT = 'https://game.chainduel.net';

export function gamePublicOrigin(): string {
  const raw = process.env.GAME_PUBLIC_URL?.trim() || GAME_PUBLIC_URL_DEFAULT;
  return raw.replace(/\/+$/, '');
}

/** Canonical public room URL — one link for players and spectators. */
export function onlineRoomPublicUrl(roomCode: string): string {
  const code = roomCode.trim().toUpperCase();
  return `${gamePublicOrigin()}/online/r/${encodeURIComponent(code)}`;
}

/** Resolve room code from id when the room is still in memory. */
export function onlineRoomPublicUrlFromRoomId(roomId: string): string | null {
  const room = getRoomById(roomId);
  if (room?.roomCode) {
    return onlineRoomPublicUrl(room.roomCode);
  }
  return null;
}
