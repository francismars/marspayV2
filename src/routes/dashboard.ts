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
import { getChallengeTelemetrySnapshot } from '../state/challengeTelemetry';
import { getFunnelCountersSnapshot } from '../telemetry/funnelCounters';
import {
  tailChallengeClaims,
  tailOnlineArchiveIndex,
} from '../telemetry/dashboardData';
import { listOnlineRooms } from '../state/onlineRoomState';

const router = Router();

function summarizeActiveOnlineRooms() {
  const now = Date.now();
  return listOnlineRooms().map((room) => {
    const seatsPaid = room.playersPaid ?? 0;
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: room.phase,
      buyin: room.buyin,
      seatsPaid,
      seatsTotal: room.seatsTotal,
      ageMs: now - room.createdAt,
    };
  });
}

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
      telemetry: {
        counters: getFunnelCountersSnapshot(),
        challenge: getChallengeTelemetrySnapshot(),
        recentClaims: tailChallengeClaims(20),
        recentOnline: tailOnlineArchiveIndex(20),
        activeOnlineRooms: summarizeActiveOnlineRooms(),
      },
    });
  } else res.status(401).send('Incorrect password.');
});

export default router;
