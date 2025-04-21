import path from 'path';
import deleteLNURLW from '../calls/LNBits/deleteLNURLW';
import { dateNow } from '../utils/time';
import { deleteGameInfoByID, serializeGameInfoFromID } from './gameState';
import { deleteLNURLWFromSession, getIDFromLNURLW } from './lnurlwState';
import { deleteSocketFromSession } from './sessionState';
import { promises as fs } from 'fs';
import { deleteLNURLPsFromSession, getLNURLPsFromID } from './lnurlpState';

export function handleEndOfSession(sessionID: string) {
  appendGameInfotoJSON(sessionID);
  const LNURLPs = getLNURLPsFromID(sessionID);
  if (LNURLPs) {
    deleteLNURLPsFromSession(sessionID);
  }
  const LNURLWFromID = getIDFromLNURLW(sessionID);
  if (LNURLWFromID) {
    deleteLNURLW(LNURLWFromID);
  }
  deleteLNURLWFromSession(sessionID);
  deleteGameInfoByID(sessionID);
  deleteSocketFromSession(sessionID);
}

function appendGameInfotoJSON(sessionID: string) {
  console.log(`${dateNow()} [${sessionID}] Writing game info to JSON.`);
  const gameInfoJson = JSON.stringify({
    [dateNow()]: serializeGameInfoFromID(sessionID),
  });
  try {
    const savePath = path.resolve(__dirname, '../../public/');
    fs.appendFile(path.join(savePath, 'games.json'), gameInfoJson + ',\n');
  } catch (error) {
    console.error(
      `${dateNow()} [${sessionID}] Error writing game info to JSON: ${error}`
    );
  }
}
