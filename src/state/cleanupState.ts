import deleteLNURLW from '../calls/LNBits/deleteLNURLW';
import { deleteGameInfoByID } from './gameState';
import { deleteLNURLWFromSession, getIDFromLNURLW } from './lnurlwState';
import { deleteSocketFromSession, getAllIDtoSocket } from './sessionState';
import { deleteLNURLPsFromSession, getLNURLPsFromID } from './lnurlpState';
import { appendGameInfotoJSON } from '../utils/json';
import { deleteKind1sFromSession } from './nostrState';
import { CLEANUP_INTERVAL, INACTIVITY_THRESHOLD } from '../consts/values';

export function handleEndOfSession(
  sessionID: string,
  appendJSON: boolean = true
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
  deleteKind1sFromSession(sessionID);
  deleteGameInfoByID(sessionID);
  deleteSocketFromSession(sessionID);
}

function cleanupInactiveSessions(inactivityThreshold: number) {
  const now = Date.now();
  const allSessions = getAllIDtoSocket();

  for (const [sessionID, session] of allSessions) {
    if (now - session.lastSeen > inactivityThreshold) {
      console.log(`Cleaning up inactive session: ${sessionID}`);
      handleEndOfSession(sessionID, false);
    }
  }
}

setInterval(() => {
  cleanupInactiveSessions(INACTIVITY_THRESHOLD);
}, CLEANUP_INTERVAL);
