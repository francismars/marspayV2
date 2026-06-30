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
  buildP2pSnapshot,
  buildQuickMatchSnapshot,
  buildRecentAttemptsSnapshot,
  buildReplaySnapshot,
  buildUserJourneySnapshot,
  buildVisitorSnapshot,
  type FunnelWindow,
} from '../telemetry/dashboardSnapshot';
import {
  buildAlertsSnapshot,
  buildCohortSnapshot,
  buildHomeSnapshot,
  buildModeFunnelSnapshot,
  buildMoneySnapshot,
  type AnalyticsWindow,
  type FunnelMode,
} from '../telemetry/dashboardAnalytics';
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

router.get('/api/home', requireDashboardAuth, (req, res) => {
  const window =
    req.query.window === '7d' ? ('7d' as AnalyticsWindow) : ('24h' as AnalyticsWindow);
  res.json(buildHomeSnapshot(window));
});

router.get('/api/alerts', requireDashboardAuth, (req, res) => {
  const window =
    req.query.window === '7d' ? ('7d' as AnalyticsWindow) : ('24h' as AnalyticsWindow);
  res.json(buildAlertsSnapshot(window));
});

router.get('/api/money', requireDashboardAuth, (_req, res) => {
  res.json(buildMoneySnapshot());
});

router.get('/api/cohorts', requireDashboardAuth, (req, res) => {
  const window = req.query.window === '24h' ? '24h' : '7d';
  res.json(buildCohortSnapshot(window as '24h' | '7d'));
});

const FUNNEL_MODES: FunnelMode[] = ['quickmatch', 'challenge', 'p2p', 'online', 'nostr'];

router.get('/api/funnels/:mode', requireDashboardAuth, (req, res) => {
  const mode = req.params.mode as FunnelMode;
  if (!FUNNEL_MODES.includes(mode)) {
    res.status(400).json({ error: 'invalid_mode' });
    return;
  }
  const window =
    req.query.window === '7d' ? ('7d' as AnalyticsWindow) : ('24h' as AnalyticsWindow);
  res.json(buildModeFunnelSnapshot(mode, window));
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

router.get('/api/visitors', requireDashboardAuth, (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
  res.json(buildVisitorSnapshot(hours));
});

router.get('/api/quickmatch', requireDashboardAuth, (_req, res) => {
  res.json(buildQuickMatchSnapshot());
});

router.get('/api/p2p', requireDashboardAuth, (_req, res) => {
  res.json(buildP2pSnapshot());
});

router.get('/api/replays', requireDashboardAuth, (_req, res) => {
  res.json(buildReplaySnapshot());
});

router.get('/api/journey', requireDashboardAuth, (req, res) => {
  const sessionID =
    typeof req.query.sessionID === 'string' ? req.query.sessionID : undefined;
  const pubkey =
    typeof req.query.pubkey === 'string' ? req.query.pubkey : undefined;
  if (!sessionID && !pubkey) {
    res.status(400).json({ error: 'sessionID_or_pubkey_required' });
    return;
  }
  res.json(buildUserJourneySnapshot({ sessionID, pubkey }));
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
