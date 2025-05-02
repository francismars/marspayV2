import { Router, Request, Response } from 'express';
import { dateNow } from '../utils/time';
import { getSocketFromID } from '../state/sessionState';
import { getIDFromLNURLP, getLNURLPsFromID } from '../state/lnurlpState';
import {
  serializeGameInfoFromID,
  getPlayerInfoFromIDToGame,
  setGameInfoByID,
  getGameInfoFromID,
} from '../state/gameState';
import {
  GameInfo,
  GameMode,
  Payment,
  PlayerInfo,
  PlayerRole,
} from '../types/game';
import { io } from '../server';
import { ExtendedError } from 'socket.io';
import dotenv from 'dotenv';
import { DESIGNERPERCENT, DEVPERCENT, HOSTPERCENT } from '../consts/splits';
import getLNURLCallback from '../calls/LNAddress/getLNURLCallback';
import getInvoiceFromCallback from '../calls/LNAddress/getInvoiceFromCallback';
import payInvoice from '../calls/LNBits/payInvoice';
import { Split } from '../types/split';
import { normalizeIP } from '../utils/ip';
import { LNURLP } from '../types/lnurlp';

const router = Router();
dotenv.config();

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
  const nolmalizedIP = req.headers['x-real-ip'];
  const allowedServerIp = process.env.LNBITS_IP;
  if (nolmalizedIP === allowedServerIp) {
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
    const lnurlp = LNURLPs.find((lnurlp) => lnurlp.id === reqLNURLP);
    if (!lnurlp) {
      return;
    }
    const playerRole = decidePlayerRole(lnurlp, sessionID);
    if (!playerRole) {
      console.error(`${dateNow()} [${sessionID}] Player role not created.`);
      res.status(404).send('Player role not created.');
      return;
    }
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
    const newPlayerInfo = new Map<PlayerRole, PlayerInfo>();
    newPlayerInfo.set(playerRole, playerInfo);
    const gameMode = lnurlp.mode as GameMode;
    const gameInfo: GameInfo = {
      mode: gameMode,
      players: newPlayerInfo,
    };
    setGameInfoByID(sessionID, gameInfo);
    const socketID = getSocketFromID(sessionID)?.socketID;
    if (!socketID) {
      console.error("Couldn't find SocketID to send notification of payment");
      return;
    }
    paySplits(sessionID, amount);
    io.to(socketID!).emit('updatePayments', serializeGameInfoFromID(sessionID));
    res.status(200).send('OK');
  }
});

function paySplits(sessionID: string, amount: number) {
  const devLN = process.env.DEVELOPER_LNADDRESS;
  const designerLN = process.env.DESIGNER_LNADDRESS;
  const hostLN = process.env.HOST_LNADDRESS;
  const devPercent = DEVPERCENT;
  const designerPercent = DESIGNERPERCENT;
  const hostPercent = HOSTPERCENT;
  if (!devLN || !designerLN || !hostLN) {
    console.error(`${dateNow()} [${sessionID}] Split address is missing.`);
  }
  const feeSplit: Split[] = [
    { lnaddress: devLN!, percent: devPercent, role: 'developer' },
    { lnaddress: hostLN!, percent: hostPercent, role: 'host' },
    { lnaddress: designerLN!, percent: designerPercent, role: 'designer' },
  ];
  for (const split of feeSplit) {
    const splitedAmount = Math.floor(amount * split.percent);
    console.log(
      `${dateNow()} [${sessionID}] Sending ${
        split.percent
      } split of ${splitedAmount} sats to ${split.lnaddress}`
    );
    paySplit(split.lnaddress as string, splitedAmount).catch((error) => {
      console.log(
        `${dateNow()} [${sessionID} Couldn't send split to ${split.role}: ${
          error.message
        }`
      );
    });
  }
}

async function paySplit(lnAddress: string, satsAmount: number) {
  const [userLN, domainLN] = lnAddress.split('@');
  const LNurl = `https://${domainLN}/.well-known/lnurlp/${userLN}`;

  const callback = await getLNURLCallback(LNurl);
  const invoice = await getInvoiceFromCallback(callback, satsAmount);
  await payInvoice(invoice);
}

function decidePlayerRole(lnurlp: LNURLP, sessionID: string) {
  if (lnurlp.mode == GameMode.P2P || lnurlp.mode == GameMode.PRACTICE) {
    return lnurlp.description as PlayerRole;
  } else {
    // if (lnurlp.mode == GameMode.TOURNAMENT)
    const gameInfos = getGameInfoFromID(sessionID);
    if (!gameInfos) {
      console.error(`${dateNow()} [${sessionID}] GameInfo not found.`);
      return;
    }
    const assignedRoles = [...gameInfos.players.keys()];
    const allRoles = Object.values(PlayerRole).slice(
      0,
      gameInfos.numberOfPlayers ?? 1
    );
    const availableRoles = allRoles.filter(
      (role) => !assignedRoles.includes(role as PlayerRole)
    );
    if (availableRoles.length === 0) {
      console.error(`${dateNow()} [${sessionID}] No available player roles.`);
      return;
    }
    return availableRoles[
      Math.floor(Math.random() * availableRoles.length)
    ] as PlayerRole;
  }
}

export default router;
