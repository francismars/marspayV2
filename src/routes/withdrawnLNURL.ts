import { Router, Request, Response } from 'express';
import { getIDFromLNURLW, getLNURLWFromID } from '../state/lnurlwState';
import { getSocketFromID } from '../state/sessionState';
import { dateNow } from '../utils/time';
import { io } from '../server';
import { handleEndOfSession } from '../state/cleanupState';
import { gameInfos } from '../socket/game';
import { getGameInfoFromID } from '../state/gameState';

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
  const gameInfos = getGameInfoFromID(sessionID);
  const LNURLW = getLNURLWFromID(sessionID);
  if (
    gameInfos &&
    gameInfos.gamemode === 'TOURNAMENT' &&
    LNURLW &&
    LNURLW.claimedCount! < LNURLW.maxWithdrawals!
  ) {
    LNURLW.claimedCount = LNURLW.claimedCount! + 1;
    console.log(
      `${dateNow()} [${sessionID}] Updated claimed count to ${
        LNURLW.claimedCount
      }.`
    );
  } else handleEndOfSession(sessionID);
});

export default router;
