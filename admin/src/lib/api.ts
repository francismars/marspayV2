const API_BASE = '/dashboard/api';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function checkAuth(): Promise<boolean> {
  const data = await apiFetch<{ authenticated: boolean }>('/me');
  return data.authenticated;
}

export async function login(password: string): Promise<void> {
  await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/logout', { method: 'POST' });
}

export type OverviewData = {
  fetchedAt: string;
  connectedSessions: number;
  activeOnlineRooms: number;
  challengeRunsToday: number;
  bountyPaidTodaySats: number;
  bountyCapSats: number;
  bountyRemainingSats: number;
  pendingZapClaims: number;
  serverUptimeSec: number;
  eventLogBytes: number;
};

export type FunnelStep = {
  ok: number;
  reject: number;
  error: number;
  total: number;
  passRate: number;
};

export type FunnelsData = {
  fetchedAt: string;
  challenge: {
    steps: Record<string, FunnelStep>;
    topRejectReasons: Record<string, Array<{ reason: string; count: number }>>;
  };
  online: {
    steps: Record<string, FunnelStep>;
    topRejectReasons: Record<string, Array<{ reason: string; count: number }>>;
  };
  client: {
    steps: Record<string, FunnelStep>;
    uiErrors: Array<{ reason: string; count: number }>;
  };
};

export type ChallengesData = {
  fetchedAt: string;
  stats: {
    byChallenge: Record<
      string,
      { wins: number; replayFailed: number; replayReasons: Record<string, number> }
    >;
    totalWins: number;
    totalReplayFailed: number;
  };
  bountyCapSats: number;
  bountySpentTodaySats: number;
  bountyRemainingSats: number;
  dailySpendSeries: Array<{ day: string; sats: number }>;
  pendingZaps: Array<{
    pubkey: string;
    challengeId: string;
    runId: string;
    bountySats: number;
    publishedAt: number | null;
  }>;
  recentClaims: Array<Record<string, unknown>>;
};

export type OnlineData = {
  fetchedAt: string;
  live: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
};

export type ActivityData = {
  fetchedAt: string;
  events: Array<{
    ts: string;
    event: string;
    outcome: string;
    reason?: string;
    sessionID?: string;
    pubkeyPrefix?: string;
    challengeId?: string;
    roomId?: string;
    roomCode?: string;
    source?: string;
    meta?: Record<string, string | number | boolean>;
  }>;
};

export type SessionsData = {
  fetchedAt: string;
  sessions: Array<{
    sessionID: string;
    lastSeenMs: number;
    nostrLinked: boolean;
    pubkeyPrefix?: string;
    kind1Count: number;
  }>;
  total: number;
  nostrLinked: number;
};

export const fetchOverview = () => apiFetch<OverviewData>('/overview');
export const fetchFunnels = () => apiFetch<FunnelsData>('/funnels');
export const fetchChallenges = () => apiFetch<ChallengesData>('/challenges');
export const fetchOnline = () => apiFetch<OnlineData>('/online');
export const fetchActivity = (params?: { limit?: number; event?: string; outcome?: string }) => {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.event) q.set('event', params.event);
  if (params?.outcome) q.set('outcome', params.outcome);
  const qs = q.toString();
  return apiFetch<ActivityData>(`/activity${qs ? `?${qs}` : ''}`);
};
export const fetchSessions = () => apiFetch<SessionsData>('/sessions');
