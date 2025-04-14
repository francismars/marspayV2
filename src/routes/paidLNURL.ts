import { Router, Request, Response } from 'express';
import { dateNow } from '../utils/time';
import {
  appendPaymentToLNURLPFromId,
  getGameInfoFromID,
  getIDFromLNURLP,
  getLNURLPsFromID,
  getPlayerInfoFromIDToGame,
  getPlayerValueFromGameSession,
  getSocketFromID,
  serializeGameInfoFromID,
  setPlayerInfoInGameByID,
} from '../socket/sessionManager';
import { GameInfo, GameMode, PlayerInfo, PlayerRole } from '../types/game';
import { io } from '../server';

const router = Router();

interface LNURLPReqBody {
  payment_hash: string;
  payment_request: string;
  amount: number;
  comment: string | null;
  webhook_data: string;
  lnurlp: string;
  body: string;
}

router.post('/', (req: Request, res: Response) => {
  const reqBody = req.body as LNURLPReqBody;
  const reqLNURLP = reqBody.lnurlp;

  if (!reqLNURLP) {
    console.error(`${dateNow()} LNURLp not sent.`);
    res.status(404).send('LNURLp not sent.');
    return;
  }
  const sessionID = getIDFromLNURLP(reqLNURLP);
  if (!sessionID) {
    console.error(`${dateNow()} Session ID not found.`);
    res.status(404).send('Session ID not found.');
    return;
  }

  const amount = reqBody.amount / 1000;
  const comment = reqBody.comment == null ? null : reqBody.comment[0];
  console.log(
    `${dateNow()} [${sessionID}] Paid LNURLp ${reqLNURLP} with ${amount} sats and note ${comment}.`
  );
  const LNURLPs = getLNURLPsFromID(sessionID);
  if (LNURLPs) {
    const lnurl = LNURLPs.find((lnurl) => lnurl.id === reqLNURLP);
    if (!lnurl) {
      return;
    }
    const playerRole: PlayerRole = lnurl.description as PlayerRole;
    appendPaymentToLNURLPFromId(
      { amount: amount, note: comment },
      reqLNURLP,
      sessionID
    );
    const value = getPlayerValueFromGameSession(sessionID, playerRole) ?? 0;
    const playerInfo: PlayerInfo = {
      name: comment?.trim() ?? playerRole,
      value: value + amount,
    };
    const gameMode = 'P2P' as GameMode;
    setPlayerInfoInGameByID(sessionID, playerRole, playerInfo, gameMode);
    const socketID = getSocketFromID(sessionID);
    if (!socketID) {
      console.error("Couldn't find SocketID to send notification of payment");
      return;
    }
    io.to(socketID!).emit('updatePayments', serializeGameInfoFromID(sessionID));
    res.status(200).send('OK');
  }
});

export default router;
