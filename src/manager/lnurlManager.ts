import { LNURLP } from '../types/lnurlp';
import deleteLNURLP from '../calls/deleteLNURLP';

const IDToLNURLW = new Map<string, string>();
const LNURLWToID = new Map<string, string>();
const IDToLNURLPs = new Map<string, Array<LNURLP>>();
const LNURLPToID = new Map<string, string>();

export function setIDToLNURLW(sessionId: string, lnurlw: string) {
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

export function appendLNURLPToID(sessionId: string, lnurlp: LNURLP) {
  if (IDToLNURLPs.has(sessionId)) {
    IDToLNURLPs.get(sessionId)?.push(lnurlp);
  } else {
    IDToLNURLPs.set(sessionId, [lnurlp]);
  }
}

export function getLNURLPsFromID(sessionId: string) {
  return IDToLNURLPs.get(sessionId);
}

export function setLNURLPToID(lnurlp: string, sessionId: string) {
  LNURLPToID.set(lnurlp, sessionId);
}

export function getIDFromLNURLP(lnurlp: string) {
  return LNURLPToID.get(lnurlp);
}

export function deleteLNURLPsFromSession(sessionId: string) {
  IDToLNURLPs.delete(sessionId);
  const lnurlps = getLNURLPsFromID(sessionId);
  if (lnurlps) {
    for (const lnurlp of lnurlps) {
      LNURLPToID.delete(lnurlp.lnurlp);
      deleteLNURLP(lnurlp.lnurlp);
    }
  }
}
