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
  buildFunnelsSnapshotForWindow,
  buildLiveSessionDetail,
  buildLiveSnapshot,
  buildOnlineSnapshot,
  buildOverviewSnapshot,
  buildRecentAttemptsSnapshot,
  type FunnelWindow,
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

router.get('/api/funnels', requireDashboardAuth, (req, res) => {
  const window =
    req.query.window === '24h' || req.query.window === '7d' || req.query.window === 'lifetime'
      ? (req.query.window as FunnelWindow)
      : 'lifetime';
  res.json(buildFunnelsSnapshotForWindow(window));
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
  const sessionID =
    typeof req.query.sessionID === 'string' ? req.query.sessionID : undefined;
  const pubkeyPrefix =
    typeof req.query.pubkeyPrefix === 'string' ? req.query.pubkeyPrefix : undefined;
  const roomCode =
    typeof req.query.roomCode === 'string' ? req.query.roomCode : undefined;
  let sinceTs: string | undefined;
  if (req.query.since === '1h') {
    sinceTs = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  } else if (req.query.since === '24h') {
    sinceTs = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  } else if (req.query.since === '7d') {
    sinceTs = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (typeof req.query.sinceTs === 'string') {
    sinceTs = req.query.sinceTs;
  }
  res.json(
    buildActivitySnapshot({
      limit,
      eventPrefix,
      outcome,
      sinceTs,
      sessionID,
      pubkeyPrefix,
      roomCode,
    })
  );
});

router.get('/api/live', requireDashboardAuth, (_req, res) => {
  res.json(buildLiveSnapshot());
});

router.get('/api/live/recent', requireDashboardAuth, (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  res.json(buildRecentAttemptsSnapshot(hours));
});

router.get('/api/live/:sessionID', requireDashboardAuth, (req, res) => {
  const detail = buildLiveSessionDetail(req.params.sessionID);
  if (!detail) {
    res.status(404).json({ error: 'session_not_connected' });
    return;
  }
  res.json(detail);
});

router.get('/api/sessions', requireDashboardAuth, (_req, res) => {
  res.json(buildLiveSnapshot());
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
