import { getAllIDtoSocket } from '../state/sessionState';
import { getAllsessionIDtoKind1s } from '../state/nostrState';
import { getAppNostrPubkeyForSession } from '../state/nostrAppSessionState';
import { getChallengeTelemetrySnapshot } from '../state/challengeTelemetry';
import {
  getDailyZapBudgetRemaining,
  listPendingZapClaims,
} from '../state/challengeState';
import { loadDailySpendSync } from '../state/challengeClaimStore';
import { listOnlineRooms, listOnlineHistoryMerged } from '../state/onlineRoomState';
import {
  getFunnelCountersSnapshot,
  parseFunnelCounters,
  sumCounter,
  topRejectReasons,
} from './funnelCounters';
import { tailChallengeClaims } from './dashboardData';
import { getRecentEvents, getEventLogByteSize } from './eventLog';

function funnelStep(
  rows: ReturnType<typeof parseFunnelCounters>,
  event: string
): { ok: number; reject: number; error: number; total: number; passRate: number } {
  const ok = sumCounter(rows, event, 'ok');
  const reject = sumCounter(rows, event, 'reject');
  const error = sumCounter(rows, event, 'error');
  const total = ok + reject + error;
  return {
    ok,
    reject,
    error,
    total,
    passRate: total > 0 ? Math.round((ok / total) * 1000) / 10 : 0,
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function truncatePubkey(pubkey: string): string {
  const hex = pubkey.toLowerCase();
  if (hex.length <= 16) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

export function buildOverviewSnapshot() {
  const rows = parseFunnelCounters(getFunnelCountersSnapshot());
  const sessions = getAllIDtoSocket();
  const activeRooms = listOnlineRooms().filter(
    (r) => r.phase !== 'finished'
  );
  const dailySpend = loadDailySpendSync();
  const cap = Math.max(0, Number(process.env.CHALLENGE_BOUNTY_DAILY_CAP_SATS ?? 100_000));
  const spentToday = dailySpend[todayKey()] ?? 0;
  const pendingZaps = listPendingZapClaims();

  return {
    fetchedAt: new Date().toISOString(),
    connectedSessions: sessions.size,
    activeOnlineRooms: activeRooms.length,
    challengeRunsToday: sumCounter(rows, 'challenge.run', 'ok'),
    bountyPaidTodaySats: spentToday,
    bountyCapSats: cap,
    bountyRemainingSats: getDailyZapBudgetRemaining(),
    pendingZapClaims: pendingZaps.length,
    serverUptimeSec: Math.floor(process.uptime()),
    eventLogBytes: getEventLogByteSize(),
  };
}

export function buildFunnelsSnapshot() {
  const rows = parseFunnelCounters(getFunnelCountersSnapshot());
  const challengeEvents = [
    'challenge.eligibility',
    'challenge.run',
    'challenge.win.submit',
    'challenge.win.replay',
    'challenge.win.token',
    'challenge.claim',
  ];
  const onlineEvents = [
    'online.room.created',
    'online.room.joined',
    'online.seat.lightning.requested',
    'online.seat.paid',
    'online.game.started',
    'online.game.finished',
    'online.payout.withdrawal',
    'online.payout.nostr',
  ];
  const clientEvents = [
    'client.page.view',
    'client.funnel.abandon',
    'client.ui.error',
  ];

  return {
    fetchedAt: new Date().toISOString(),
    challenge: {
      steps: Object.fromEntries(challengeEvents.map((e) => [e, funnelStep(rows, e)])),
      topRejectReasons: {
        eligibility: topRejectReasons(rows, 'challenge.eligibility'),
        run: topRejectReasons(rows, 'challenge.run'),
        winSubmit: topRejectReasons(rows, 'challenge.win.submit'),
        claim: topRejectReasons(rows, 'challenge.claim'),
      },
    },
    online: {
      steps: Object.fromEntries(onlineEvents.map((e) => [e, funnelStep(rows, e)])),
      topRejectReasons: {
        seatPaid: topRejectReasons(rows, 'online.seat.pay_rejected'),
        joined: topRejectReasons(rows, 'online.room.joined'),
        gameStarted: topRejectReasons(rows, 'online.game.started'),
      },
    },
    client: {
      steps: Object.fromEntries(clientEvents.map((e) => [e, funnelStep(rows, e)])),
      uiErrors: topRejectReasons(rows, 'client.ui.error'),
    },
  };
}

export function buildChallengesSnapshot() {
  const challenge = getChallengeTelemetrySnapshot();
  const dailySpend = loadDailySpendSync();
  const cap = Math.max(0, Number(process.env.CHALLENGE_BOUNTY_DAILY_CAP_SATS ?? 100_000));
  const spentToday = dailySpend[todayKey()] ?? 0;
  const pending = listPendingZapClaims().map((c) => ({
    pubkey: truncatePubkey(c.pubkey),
    challengeId: c.challengeId,
    runId: c.runId,
    bountySats: c.bountySats,
    publishedAt: c.publishedAt,
  }));

  const recentClaims = tailChallengeClaims(30).map((row) => {
    const r = row as Record<string, unknown>;
    const pubkey = typeof r.pubkey === 'string' ? truncatePubkey(r.pubkey) : '?';
    return {
      pubkey,
      challengeId: r.challengeId,
      runId: r.runId,
      bountySats: r.bountySats,
      zapPaidAt: r.zapPaidAt,
      publishedAt: r.publishedAt,
    };
  });

  const dailySpendSeries = Object.entries(dailySpend)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, sats]) => ({ day, sats }));

  return {
    fetchedAt: new Date().toISOString(),
    stats: challenge,
    bountyCapSats: cap,
    bountySpentTodaySats: spentToday,
    bountyRemainingSats: getDailyZapBudgetRemaining(),
    dailySpendSeries,
    pendingZaps: pending,
    recentClaims,
  };
}

export function buildOnlineSnapshot() {
  const now = Date.now();
  const live = listOnlineRooms().map((room) => ({
    roomId: room.roomId,
    roomCode: room.roomCode,
    phase: room.phase,
    buyin: room.buyin,
    matchRound: room.matchRound,
    seatsPaid: room.playersPaid,
    seatsTotal: room.seatsTotal,
    spectators: room.spectators,
    ageMs: now - room.createdAt,
    result: room.result,
    replay: room.replay,
  }));

  const history = listOnlineHistoryMerged()
    .filter((r) => r.archived || r.phase === 'finished' || r.phase === 'postgame')
    .slice(0, 50)
    .map((room) => ({
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: room.phase,
      buyin: room.buyin,
      matchRound: room.matchRound,
      finishedAt: room.finishedAt,
      archiveKind: room.archiveKind,
      result: room.result,
      replay: room.replay,
    }));

  return {
    fetchedAt: new Date().toISOString(),
    live,
    history,
  };
}

export function buildActivitySnapshot(params?: {
  limit?: number;
  eventPrefix?: string;
  outcome?: 'ok' | 'reject' | 'error';
}) {
  const limit = params?.limit ?? 100;
  const events = getRecentEvents(limit, {
    eventPrefix: params?.eventPrefix,
    outcome: params?.outcome,
  });
  return {
    fetchedAt: new Date().toISOString(),
    events: events.map((e) => ({
      ts: e.ts,
      event: e.event,
      outcome: e.outcome,
      reason: e.reason,
      sessionID: e.sessionID,
      pubkeyPrefix: e.pubkeyPrefix,
      challengeId: e.challengeId,
      roomId: e.roomId,
      roomCode: e.roomCode,
      source: e.source,
      meta: e.meta,
    })),
  };
}

export function buildSessionsSnapshot() {
  const now = Date.now();
  const sessions = getAllIDtoSocket();
  const kind1Map = getAllsessionIDtoKind1s();

  const rows = [...sessions.entries()].map(([sessionID, session]) => {
    const appPk = getAppNostrPubkeyForSession(sessionID);
    const kind1s = kind1Map.get(sessionID);
    return {
      sessionID,
      lastSeenMs: now - session.lastSeen,
      nostrLinked: Boolean(appPk),
      pubkeyPrefix: appPk ? appPk.slice(0, 12) : undefined,
      kind1Count: kind1s?.length ?? 0,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    sessions: rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs),
    total: rows.length,
    nostrLinked: rows.filter((r) => r.nostrLinked).length,
  };
}
