import { LNURLW } from '../types/lnurlw';

const IDToLNURLW = new Map<string, LNURLW>();
const LNURLWToID = new Map<string, string>();

export function setIDToLNURLW(sessionId: string, lnurlw: LNURLW) {
  IDToLNURLW.set(sessionId, lnurlw);
}

export function getLNURLWFromID(sessionId: string) {
  return IDToLNURLW.get(sessionId);
}

export function setLNURLWToID(lnurlw: string, sessionId: string) {
  LNURLWToID.set(lnurlw, sessionId);
}

export function getIDFromLNURLW(lnurlw: string) {
  return LNURLWToID.get(lnurlw);
}

export function deleteLNURLWFromSession(sessionId: string) {
  const lnurlw = getLNURLWFromID(sessionId);
  if (lnurlw) {
    IDToLNURLW.delete(sessionId);
    LNURLWToID.delete(lnurlw.id);
  }
}

export function getAllIDtoLNURLW() {
  return IDToLNURLW;
}

export function getAllLNURLWtoID() {
  return LNURLWToID;
}
