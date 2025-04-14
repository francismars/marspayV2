const IDToSocket = new Map<string, string>();

export function setIDToSocket(sessionId: string, socketId: string) {
  IDToSocket.set(sessionId, socketId);
}

export function getSocketFromID(sessionId: string) {
  return IDToSocket.get(sessionId);
}
