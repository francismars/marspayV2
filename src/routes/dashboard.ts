import { Router, Request, Response } from 'express';
import { getAllIDtoSocket } from '../state/sessionState';
import dotenv from 'dotenv';
import { getAllIDtoLNURLW, getAllLNURLWtoID } from '../state/lnurlwState';
import { getAllIDtoLNURLPs, getAllLNURLPtoID } from '../state/lnurlpState';
import { serializeIDToGameInfo } from '../state/gameState';

const router = Router();

router.get('/', function (req, res) {
  dotenv.config();
  const passwordDash = process.env.ADMIN_PASSWORD;
  if (req.query.password && req.query.password == passwordDash) {
    const IDtoSocket = Object.fromEntries(getAllIDtoSocket());
    const IDToLNURLW = Object.fromEntries(getAllIDtoLNURLW());
    const LNURLWToID = Object.fromEntries(getAllLNURLWtoID());
    const LNURLPToID = Object.fromEntries(getAllLNURLPtoID());
    const IDToLNURLPs = Object.fromEntries(getAllIDtoLNURLPs());
    const IDtoGameInfo = serializeIDToGameInfo();
    res.json({
      IDtoSocket: IDtoSocket,
      IDToLNURLW: IDToLNURLW,
      LNURLWToID: LNURLWToID,
      LNURLPToID: LNURLPToID,
      IDToLNURLPs: IDToLNURLPs,
      IDtoGameInfo: IDtoGameInfo,
    });
  } else res.status(401).send('Incorrect password.');
});

export default router;
