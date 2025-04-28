import { Router, Request, Response } from 'express';
import { getAllIDtoSocket } from '../state/sessionState';
import dotenv from 'dotenv';
import { getAllIDtoLNURLW, getAllLNURLWtoID } from '../state/lnurlwState';
import { getAllIDtoLNURLPs, getAllLNURLPtoID } from '../state/lnurlpState';
import { getSerializedIDToGameInfo } from '../state/gameState';
import {
  getAllkind1IDtoSessionID,
  getAllsessionIDtoKind1s,
} from '../state/nostrState';

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
    const kind1IDtoSessionID = Object.fromEntries(getAllkind1IDtoSessionID());
    const sessionIDtoKind1s = Object.fromEntries(getAllsessionIDtoKind1s());
    const IDtoGameInfo = getSerializedIDToGameInfo();
    res.json({
      IDtoSocket: IDtoSocket,
      IDToLNURLW: IDToLNURLW,
      LNURLWToID: LNURLWToID,
      LNURLPToID: LNURLPToID,
      IDToLNURLPs: IDToLNURLPs,
      kind1IDtoSessionID: kind1IDtoSessionID,
      sessionIDtoKind1s: sessionIDtoKind1s,
      IDtoGameInfo: IDtoGameInfo,
    });
  } else res.status(401).send('Incorrect password.');
});

export default router;
