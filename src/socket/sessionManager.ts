import { LNURLP } from "../types/lnurlp";

const IDToSocket = new Map<string, string>();
const IDToLNURLW = new Map<string, string>();
const IDToLNURLPs = new Map<string, Array<LNURLP>>();
const LNURLPToID = new Map<string, string>();
const IDToGameInfo = new Map<string, { winners: [string] }>();

export function setIDToSocket(sessionId: string, socketId: string) {
  IDToSocket.set(sessionId, socketId);
}

export function getSocketFromID(sessionId: string) {
  return IDToSocket.get(sessionId);
}

export function setIDToLNURLW(sessionId: string, lnurlw: string) {
  IDToLNURLW.set(sessionId, lnurlw);
}

export function getLNURLWFromID(sessionId: string) {
  return IDToLNURLW.get(sessionId);
}

export function appendLNURLPToID(sessionId: string, lnurlp: LNURLP) {
  if (IDToLNURLPs.has(sessionId)) {
    IDToLNURLPs.get(sessionId)?.push(lnurlp);
  } else {
    IDToLNURLPs.set(sessionId, [lnurlp]);
  }
}

export function getLNURPsFromID(sessionId: string) {
  return IDToLNURLPs.get(sessionId);
}

export function setLNURLPToID(lnurlp: string, sessionId: string) {
  LNURLPToID.set(lnurlp, sessionId);
}

export function getIDFromLNURLP(lnurlp: string) {
  return LNURLPToID.get(lnurlp);
}

export function getGameInfoFromID(sessionId: string) {
  return IDToGameInfo.get(sessionId);
}
