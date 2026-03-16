import deleteLNURLW from '../calls/LNBits/deleteLNURLW';
import { deleteGameInfoByID, getGameInfoFromID } from './gameState';
import { deleteLNURLWFromSession, getIDFromLNURLW } from './lnurlwState';
import { deleteSocketFromSession, getAllIDtoSocket } from './sessionState';
import { deleteLNURLPsFromSession, getLNURLPsFromID } from './lnurlpState';
import { appendGameInfotoJSON } from '../utils/json';
import { deleteKind1sFromSession } from './nostrState';
import { CLEANUP_INTERVAL, INACTIVITY_THRESHOLD } from '../consts/values';
import { dateNow } from '../utils/time';

export function handleEndOfSession(
  sessionID: string,
  appendJSON: boolean = true,
  deleteKind1: boolean = false
) {
  if (appendJSON) appendGameInfotoJSON(sessionID);
  const LNURLPs = getLNURLPsFromID(sessionID);
  if (LNURLPs) {
    deleteLNURLPsFromSession(sessionID);
  }
  const LNURLWFromID = getIDFromLNURLW(sessionID);
  if (LNURLWFromID) {
    deleteLNURLW(LNURLWFromID);
  }
  deleteLNURLWFromSession(sessionID);
  if (deleteKind1) {
    deleteKind1sFromSession(sessionID);
  }
  deleteGameInfoByID(sessionID);
  deleteSocketFromSession(sessionID);
}

function cleanupInactiveSessions(inactivityThreshold: number) {
  const now = Date.now();
  const allSessions = getAllIDtoSocket();

  for (const [sessionID, session] of allSessions) {
    if (now - session.lastSeen > inactivityThreshold) {
      console.log(`${dateNow()} [${sessionID}] Cleaning up inactive session.`);
      const gameInfo = getGameInfoFromID(sessionID);
      const saveState = gameInfo?.winners ? true : false;
      const hasDeposits = (gameInfo?.players?.size ?? 0) > 0;
      // Delete stale kind1 only for unused sessions with no deposits.
      handleEndOfSession(sessionID, saveState, !hasDeposits);
    }
  }
}

setInterval(() => {
  cleanupInactiveSessions(INACTIVITY_THRESHOLD);
}, CLEANUP_INTERVAL);
