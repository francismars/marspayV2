import { Router, Request, Response } from 'express';
import { dateNow } from '../utils/time';
import { getSocketFromID } from '../state/sessionState';
import { getIDFromLNURLP, getLNURLPsFromID } from '../state/lnurlpState';
import {
  serializeGameInfoFromID,
  setPlayerInfoInGameByID,
  getPlayerInfoFromIDToGame,
} from '../state/gameState';
import { GameMode, Payment, PlayerInfo, PlayerRole } from '../types/game';
import { io } from '../server';
import { ExtendedError } from 'socket.io';

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

function ipFilter(
  req: Request,
  res: Response,
  next: (err?: ExtendedError) => void
) {
  const requestIp = req.ip?.replace('::ffff:', '');
  const allowedServerIp = process.env.LNBITS_IP;
  if (requestIp === allowedServerIp) {
    next();
  } else {
    res.status(403).send('Access denied');
  }
}

router.post('/', ipFilter, (req: Request, res: Response) => {
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
  const comment = reqBody.comment?.[0] ?? null;
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
    const playerInfos = getPlayerInfoFromIDToGame(sessionID, playerRole);
    const value = playerInfos?.value ?? 0;
    const prevName = playerInfos?.name ?? null;
    const prevPayments = playerInfos?.payments ?? [];
    const playerName = comment?.trim() ?? prevName ?? playerRole;
    const payment: Payment = { amount: amount, note: comment };
    const playerInfo: PlayerInfo = {
      name: playerName,
      value: value + amount,
      payments: [...prevPayments, payment],
    };
    const gameMode = lnurl.mode as GameMode;

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
