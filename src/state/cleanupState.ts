import deleteLNURLW from '../calls/LNBits/deleteLNURLW';
import { deleteGameInfoByID, serializeGameInfoFromID } from './gameState';
import { deleteLNURLWFromSession, getIDFromLNURLW } from './lnurlwState';
import { deleteSocketFromSession } from './sessionState';
import { deleteLNURLPsFromSession, getLNURLPsFromID } from './lnurlpState';
import { appendGameInfotoJSON } from '../utils/json';
import { deleteKind1sFromSession } from './nostrState';

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
