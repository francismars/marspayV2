import { LNURLP } from '../types/lnurlp';
import deleteLNURLP from '../calls/LNBits/deleteLNURLP';

const LNURLPToID = new Map<string, string>();
const IDToLNURLPs = new Map<string, Array<LNURLP>>();

export function getLNURLPsFromID(sessionId: string) {
  return IDToLNURLPs.get(sessionId);
}

export function setLNURLPToID(lnurlp: string, sessionId: string) {
  LNURLPToID.set(lnurlp, sessionId);
}

export function getIDFromLNURLP(lnurlp: string) {
  return LNURLPToID.get(lnurlp);
}

export function appendLNURLPToID(sessionId: string, lnurlp: LNURLP) {
  if (IDToLNURLPs.has(sessionId)) {
    IDToLNURLPs.get(sessionId)?.push(lnurlp);
  } else {
    IDToLNURLPs.set(sessionId, [lnurlp]);
  }
}

export function deleteLNURLPsFromSession(sessionId: string) {
  const lnurlps = getLNURLPsFromID(sessionId);
  if (lnurlps) {
    for (const lnurlp of lnurlps) {
      LNURLPToID.delete(lnurlp.id);
      deleteLNURLP(lnurlp.id);
    }
  }
  IDToLNURLPs.delete(sessionId);
}

export function getAllLNURLPtoID() {
  return LNURLPToID;
}

export function getAllIDtoLNURLPs() {
  return IDToLNURLPs;
}
