import { Session } from '../types/session';

const IDToSocket = new Map<string, Session>();

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
