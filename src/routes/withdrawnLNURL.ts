import { Router, Request, Response } from 'express';
import { getIDFromLNURLW } from '../state/lnurlState';
import { getSocketFromID } from '../state/sessionState';
import { getGameInfoFromID } from '../state/gameState';
import { dateNow } from '../utils/time';
import { io } from '../server';

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
  const gameInfos = getGameInfoFromID(sessionID);
  if (!gameInfos) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    res.status(404).send('Game info not found.');
    return;
  }
  console.log(`${dateNow()} [${sessionID}] Claimed LNURLw ${lnurlw}.`);
  io.to(socketID).emit('prizeWithdrawn');
  res.send({ body: 'Withdrawn' });
});

export default router;
