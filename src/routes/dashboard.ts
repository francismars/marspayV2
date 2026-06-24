import { Router, Request, Response } from 'express';
import path from 'path';
import express from 'express';
import { getAllIDtoSocket } from '../state/sessionState';
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
import {
  buildActivitySnapshot,
  buildChallengesSnapshot,
  buildFunnelsSnapshot,
  buildOnlineSnapshot,
  buildOverviewSnapshot,
  buildSessionsSnapshot,
} from '../telemetry/dashboardSnapshot';
import {
  handleDashboardLogin,
  handleDashboardLogout,
  isDashboardAuthenticated,
  requireDashboardAuth,
  verifyLegacyPassword,
} from './dashboardAuth';

const router = Router();

const adminDir = path.join(__dirname, '../../public/admin');

function summarizeActiveOnlineRooms() {
  const now = Date.now();
  return listOnlineRooms().map((room) => ({
    roomId: room.roomId,
    roomCode: room.roomCode,
    phase: room.phase,
    buyin: room.buyin,
    seatsPaid: room.playersPaid ?? 0,
    seatsTotal: room.seatsTotal,
    ageMs: now - room.createdAt,
  }));
}

function buildLegacyRawDump() {
  const IDtoSocket = Object.fromEntries(getAllIDtoSocket());
  const IDToLNURLW = Object.fromEntries(getAllIDtoLNURLW());
  const LNURLWToID = Object.fromEntries(getAllLNURLWtoID());
  const LNURLPToID = Object.fromEntries(getAllLNURLPtoID());
  const IDToLNURLPs = Object.fromEntries(getAllIDtoLNURLPs());
  const kind1IDtoSessionID = Object.fromEntries(getAllkind1IDtoSessionID());
  const sessionIDtoKind1s = Object.fromEntries(getAllsessionIDtoKind1s());
  const IDtoGameInfo = getSerializedIDToGameInfo();
  return {
    IDtoSocket,
    IDToLNURLW,
    LNURLWToID,
    LNURLPToID,
    IDToLNURLPs,
    kind1IDtoSessionID,
    sessionIDtoKind1s,
    IDtoGameInfo,
    telemetry: {
      counters: getFunnelCountersSnapshot(),
      challenge: getChallengeTelemetrySnapshot(),
      recentClaims: tailChallengeClaims(20),
      recentOnline: tailOnlineArchiveIndex(20),
      activeOnlineRooms: summarizeActiveOnlineRooms(),
    },
  };
}

router.post('/api/login', handleDashboardLogin);
router.post('/api/logout', handleDashboardLogout);

router.get('/api/me', (req, res) => {
  res.json({ authenticated: isDashboardAuthenticated(req) });
});

router.get('/api/overview', requireDashboardAuth, (_req, res) => {
  res.json(buildOverviewSnapshot());
});

router.get('/api/funnels', requireDashboardAuth, (_req, res) => {
  res.json(buildFunnelsSnapshot());
});

router.get('/api/challenges', requireDashboardAuth, (_req, res) => {
  res.json(buildChallengesSnapshot());
});

router.get('/api/online', requireDashboardAuth, (_req, res) => {
  res.json(buildOnlineSnapshot());
});

router.get('/api/activity', requireDashboardAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const eventPrefix =
    typeof req.query.event === 'string' ? req.query.event : undefined;
  const outcome =
    req.query.outcome === 'ok' || req.query.outcome === 'reject' || req.query.outcome === 'error'
      ? req.query.outcome
      : undefined;
  res.json(buildActivitySnapshot({ limit, eventPrefix, outcome }));
});

router.get('/api/sessions', requireDashboardAuth, (_req, res) => {
  res.json(buildSessionsSnapshot());
});

router.get('/api/debug/raw', requireDashboardAuth, (_req, res) => {
  res.json(buildLegacyRawDump());
});

router.get('/', (req: Request, res: Response) => {
  if (verifyLegacyPassword(req)) {
    res.set('Deprecation', 'true');
    res.set('Link', '</dashboard/api/overview>; rel="successor-version"');
    res.json(buildOverviewSnapshot());
    return;
  }
  if (req.query.password) {
    res.status(401).send('Incorrect password. Use POST /dashboard/api/login or open the admin UI.');
    return;
  }
  res.sendFile(path.join(adminDir, 'index.html'), (err) => {
    if (err) {
      res.status(503).send(
        'Admin UI not built. Run: npm run build:admin'
      );
    }
  });
});

router.use(express.static(adminDir));

export default router;
