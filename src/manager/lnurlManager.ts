import { LNURLP, Payment } from '../types/lnurlp';

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

export function appendPaymentToLNURLPFromId(
  payment: Payment,
  lnurlPID: string,
  sessionId: string
) {
  if (IDToLNURLPs.has(sessionId)) {
    const lnurlp = IDToLNURLPs.get(sessionId)?.find(
      (lnurl) => lnurl.id === lnurlPID
    );
    if (!lnurlp) {
      console.error('LNURLP not found');
      return;
    }
    lnurlp.payments
      ? lnurlp.payments.push(payment)
      : (lnurlp.payments = [payment]);
  }
}
