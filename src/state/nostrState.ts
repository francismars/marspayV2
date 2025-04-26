import { Kind1 } from '../types/nostr';

const kind1IDtoSessionID = new Map<string, string>();
const sessionIDtoKind1s = new Map<string, Kind1[]>();

export function getSessionIDfromKind1ID(sessionID: string) {
  return kind1IDtoSessionID.get(sessionID);
}

export function setKind1IDtoSessionID(noteID: string, sessionID: string) {
  kind1IDtoSessionID.set(noteID, sessionID);
}

export function getKind1sfromSessionID(sessionID: string) {
  return sessionIDtoKind1s.get(sessionID);
}

export function appendKind1toSessionID(sessionID: string, kind1: Kind1) {
  if (sessionIDtoKind1s.has(sessionID)) {
    sessionIDtoKind1s.get(sessionID)?.push(kind1);
  } else {
    sessionIDtoKind1s.set(sessionID, [kind1]);
  }
}
