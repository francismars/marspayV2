import { Router, Request, Response } from 'express';
import { deleteLNURLWFromSession, getIDFromLNURLW } from '../state/lnurlwState';
import {
  deleteSocketFromSession,
  getSocketFromID,
} from '../state/sessionState';
import {
  deleteGameInfoByID,
  getGameInfoFromID,
  serializeGameInfoFromID,
} from '../state/gameState';
import { dateNow } from '../utils/time';
import { io } from '../server';
import { promises as fs } from 'fs';
import path from 'path';
import deleteLNURLW from '../calls/deleteLNURLW';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const lnurlw = req.body.lnurlw;
  if (!lnurlw) {
    console.error(`${dateNow()} LNURLw not sent.`);
    res.status(404).send('LNURLw not sent.');
    return;
  }
  const sessionID = getIDFromLNURLW(lnurlw);
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    res.status(404).send('Session ID not found.');
    return;
  }
  const socketID = getSocketFromID(sessionID);
  if (!socketID) {
    console.error(`${dateNow()} [${sessionID}] Socket ID not found.`);
    res.status(404).send('Socket ID not found.');
    return;
  }
  console.log(`${dateNow()} [${sessionID}] Claimed LNURLw ${lnurlw}.`);
  io.to(socketID).emit('prizeWithdrawn');
  res.send({ body: 'Withdrawn' });
  handleEndOfSession(sessionID, lnurlw);
});

function handleEndOfSession(sessionID: string, lnurlw: string) {
  console.log(`${dateNow()} [${sessionID}] Ending session.`);
  appendGameInfotoJSON(sessionID);
  deleteLNURLW(lnurlw);
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

export default router;
