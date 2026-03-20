import { Session } from '../types/session';

const IDToSocket = new Map<string, Session>();

/** Prefix avoids collisions with ONLINE `roomId` UUIDs and other room names. */
const SESSION_SOCKET_ROOM_PREFIX = 'marspay:session:';

/** Socket.IO room used for per-session fan-out (LNURL payment, Nostr zap UI, withdraw). */
export function sessionSocketRoomName(sessionId: string): string {
  return `${SESSION_SOCKET_ROOM_PREFIX}${sessionId}`;
}

export function setIDToSocket(sessionId: string, session: Session) {
  IDToSocket.set(sessionId, session);
}

export function getSocketFromID(sessionId: string) {
  return IDToSocket.get(sessionId);
}

export function deleteSocketFromSession(sessionId: string) {
  const socketId = getSocketFromID(sessionId);
  if (socketId) {
    IDToSocket.delete(sessionId);
  }
}

export function getAllIDtoSocket() {
  return IDToSocket;
}
