const IDToLNURLW = new Map<string, string>();
const LNURLWToID = new Map<string, string>();

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

export function deleteLNURLWFromSession(sessionId: string) {
  const lnurlw = getLNURLWFromID(sessionId);
  if (lnurlw) {
    IDToLNURLW.delete(sessionId);
    LNURLWToID.delete(lnurlw);
  }
}
