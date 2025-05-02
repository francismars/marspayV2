import { Router, Request, Response } from 'express';
import { getIDFromLNURLW, getLNURLWFromID } from '../state/lnurlwState';
import { getSocketFromID } from '../state/sessionState';
import { dateNow } from '../utils/time';
import { io } from '../server';
import { handleEndOfSession } from '../state/cleanupState';
import { getGameInfoFromID } from '../state/gameState';
import { GameMode } from '../types/game';

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
  const socketID = getSocketFromID(sessionID)?.socketID;
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
  if (!gameInfos) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    return;
  }
  if (!LNURLW) {
    console.error(`${dateNow()} [${sessionID}] LNURLw not found.`);
    return;
  }
  if (
    gameInfos.mode === GameMode.TOURNAMENT &&
    LNURLW.claimedCount! < LNURLW.maxWithdrawals!
  ) {
    LNURLW.claimedCount = LNURLW.claimedCount! + 1;
    console.log(
      `${dateNow()} [${sessionID}] Updated claimed count to ${
        LNURLW.claimedCount
      } out of ${LNURLW.maxWithdrawals}.`
    );
  }
  const appendToJson =
    gameInfos.mode === GameMode.TOURNAMENT &&
    LNURLW.claimedCount &&
    LNURLW.maxWithdrawals &&
    LNURLW.claimedCount === LNURLW.maxWithdrawals
      ? false
      : true;
  handleEndOfSession(sessionID, appendToJson);
});

export default router;
