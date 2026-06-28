import { useCallback, useEffect, useState } from 'react';
import {
  checkAuth,
  fetchActivity,
  fetchChallenges,
  fetchFunnels,
  fetchLive,
  fetchLiveRecent,
  fetchOnline,
  fetchOverview,
  fetchP2p,
  fetchQuickMatch,
  fetchReplays,
  fetchVisitors,
  logout,
  type ActivityFilters,
} from './lib/api';
import { usePolling } from './lib/hooks';
import { LoginScreen } from './components/LoginScreen';
import { OverviewTab } from './components/OverviewTab';
import { FunnelsTab } from './components/FunnelsTab';
import { ChallengeTab } from './components/ChallengeTab';
import { OnlineTab } from './components/OnlineTab';
import { ActivityTab } from './components/ActivityTab';
import { LiveTab } from './components/LiveTab';
import { VisitorsTab } from './components/VisitorsTab';
import { QuickMatchTab } from './components/QuickMatchTab';
import { P2pTab } from './components/P2pTab';
import { ExplorerTab } from './components/ExplorerTab';
import { ErrorBanner, LoadingState } from './components/ui';

type Tab =
  | 'overview'
  | 'visitors'
  | 'funnels'
  | 'challenge'
  | 'quickmatch'
  | 'p2p'
  | 'online'
  | 'activity'
  | 'live'
  | 'explorer';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'visitors', label: 'Visitors' },
  { id: 'funnels', label: 'Funnels' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'quickmatch', label: 'Quick Match' },
  { id: 'p2p', label: 'P2P' },
  { id: 'online', label: 'ONLINE' },
  { id: 'activity', label: 'Activity' },
  { id: 'live', label: 'Live' },
  { id: 'explorer', label: 'Explorer' },
];

function parseTabFromUrl(): Tab {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('tab');
  if (raw === 'sessions') return 'live';
  if (raw && TABS.some((t) => t.id === raw)) return raw as Tab;
  return 'overview';
}

function parseActivityFiltersFromUrl(): ActivityFilters {
  const params = new URLSearchParams(window.location.search);
  const since = params.get('since');
  return {
    event: params.get('event') ?? undefined,
    outcome: params.get('outcome') ?? undefined,
    sessionID: params.get('sessionID') ?? undefined,
    pubkeyPrefix: params.get('pubkeyPrefix') ?? undefined,
    roomCode: params.get('roomCode') ?? undefined,
    since:
      since === '1h' || since === '24h' || since === '7d' ? since : undefined,
  };
}

function syncUrl(tab: Tab, extras?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
  }
  window.history.replaceState(null, '', `?${params.toString()}`);
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>(() => parseTabFromUrl());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [funnelWindow, setFunnelWindow] = useState<'lifetime' | '24h' | '7d'>('lifetime');
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(() =>
    parseActivityFiltersFromUrl()
  );
  const [selectedSession, setSelectedSession] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });

  useEffect(() => {
    void checkAuth().then(setAuthed);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) setSelectedSession(session);
  }, [tab]);

  const setTabWithUrl = useCallback(
    (next: Tab, extras?: Record<string, string | undefined>) => {
      setTab(next);
      if (next === 'activity') {
        syncUrl(next, {
          event: activityFilters.event,
          outcome: activityFilters.outcome,
          since: activityFilters.since,
          sessionID: activityFilters.sessionID,
          pubkeyPrefix: activityFilters.pubkeyPrefix,
          roomCode: activityFilters.roomCode,
          ...extras,
        });
      } else if (next === 'live') {
        syncUrl(next, { session: selectedSession ?? undefined, ...extras });
      } else {
        syncUrl(next, extras);
      }
    },
    [activityFilters, selectedSession]
  );

  const overview = usePolling(fetchOverview, authed === true && tab === 'overview' && autoRefresh, 15000);
  const funnelsFetcher = useCallback(() => fetchFunnels(funnelWindow), [funnelWindow]);
  const funnels = usePolling(
    funnelsFetcher,
    authed === true && tab === 'funnels' && autoRefresh,
    15000
  );
  const challenges = usePolling(fetchChallenges, authed === true && tab === 'challenge' && autoRefresh, 15000);
  const visitors = usePolling(
    () => fetchVisitors(24),
    authed === true && tab === 'visitors' && autoRefresh,
    15000
  );
  const quickmatch = usePolling(
    fetchQuickMatch,
    authed === true && tab === 'quickmatch' && autoRefresh,
    15000
  );
  const p2p = usePolling(fetchP2p, authed === true && tab === 'p2p' && autoRefresh, 15000);
  const online = usePolling(fetchOnline, authed === true && tab === 'online' && autoRefresh, 15000);
  const replays = usePolling(
    fetchReplays,
    authed === true && tab === 'online' && autoRefresh,
    30000
  );
  const live = usePolling(fetchLive, authed === true && tab === 'live' && autoRefresh, 15000);
  const liveRecent = usePolling(
    () => fetchLiveRecent(24),
    authed === true && tab === 'live' && autoRefresh,
    30000
  );

  const activityFetcher = useCallback(
    () => fetchActivity({ limit: 100, ...activityFilters }),
    [activityFilters]
  );
  const activity = usePolling(activityFetcher, authed === true && tab === 'activity' && autoRefresh, 10000);

  useEffect(() => {
    if (tab === 'activity' && authed) {
      void activity.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFilters, tab, authed]);

  useEffect(() => {
    if (tab === 'funnels' && authed) {
      void funnels.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelWindow, tab, authed]);

  const handleActivityFilterChange = useCallback(
    (filters: ActivityFilters) => {
      setActivityFilters(filters);
      if (tab === 'activity') {
        syncUrl('activity', {
          event: filters.event,
          outcome: filters.outcome,
          since: filters.since,
          sessionID: filters.sessionID,
          pubkeyPrefix: filters.pubkeyPrefix,
          roomCode: filters.roomCode,
        });
      }
    },
    [tab]
  );

  const goToActivityForSession = useCallback(
    (sessionID: string) => {
      const filters: ActivityFilters = { sessionID };
      setActivityFilters(filters);
      setSelectedSession(null);
      setTab('activity');
      syncUrl('activity', { sessionID });
    },
    []
  );

  const goToLiveForSession = useCallback((sessionID: string) => {
    setSelectedSession(sessionID);
    setTab('live');
    syncUrl('live', { session: sessionID });
  }, []);

  const activePoll =
    tab === 'overview'
      ? overview
      : tab === 'visitors'
        ? visitors
      : tab === 'funnels'
        ? funnels
        : tab === 'challenge'
          ? challenges
          : tab === 'quickmatch'
            ? quickmatch
            : tab === 'p2p'
              ? p2p
          : tab === 'online'
            ? online
            : tab === 'activity'
              ? activity
              : live;

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <LoadingState />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Chain Duel Ops</h1>
            <p className="text-xs text-slate-500">marspay telemetry dashboard</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-surface-border"
              />
              Live refresh
            </label>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span
                className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-slate-600'}`}
              />
              {activePoll.data?.fetchedAt
                ? `Updated ${new Date(activePoll.data.fetchedAt).toLocaleTimeString()}`
                : '—'}
            </span>
            <button
              type="button"
              onClick={() => void activePoll.refresh()}
              className="rounded border border-surface-border px-2 py-1 text-slate-300 hover:bg-surface-raised"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded border border-surface-border px-2 py-1 text-slate-400 hover:text-slate-200"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabWithUrl(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-accent/20 text-accent'
                  : 'text-slate-400 hover:bg-surface-raised hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {activePoll.error ? <ErrorBanner message={activePoll.error} /> : null}
        {activePoll.loading && !activePoll.data ? (
          <LoadingState />
        ) : (
          <>
            {tab === 'overview' && overview.data ? (
              <OverviewTab data={overview.data} />
            ) : null}
            {tab === 'visitors' && visitors.data ? (
              <VisitorsTab data={visitors.data} />
            ) : null}
            {tab === 'funnels' && funnels.data ? (
              <FunnelsTab
                data={funnels.data}
                window={funnelWindow}
                onWindowChange={(w) => {
                  setFunnelWindow(w);
                  syncUrl('funnels', { window: w });
                }}
              />
            ) : null}
            {tab === 'challenge' && challenges.data ? (
              <ChallengeTab data={challenges.data} />
            ) : null}
            {tab === 'quickmatch' && quickmatch.data ? (
              <QuickMatchTab data={quickmatch.data} />
            ) : null}
            {tab === 'p2p' && p2p.data ? (
              <P2pTab data={p2p.data} />
            ) : null}
            {tab === 'online' && online.data ? (
              <OnlineTab
                data={online.data}
                replays={replays.data ?? undefined}
                onSeatClick={goToLiveForSession}
              />
            ) : null}
            {tab === 'activity' && activity.data ? (
              <ActivityTab
                data={activity.data}
                filters={activityFilters}
                onFilterChange={handleActivityFilterChange}
                onSessionClick={goToLiveForSession}
              />
            ) : null}
            {tab === 'live' && live.data ? (
              <LiveTab
                live={live.data}
                recent={liveRecent.data}
                selectedSession={selectedSession}
                onSelectSession={setSelectedSession}
                onFilterActivity={(f) => {
                  const next = { ...activityFilters, ...f };
                  setActivityFilters(next);
                  setTab('activity');
                  syncUrl('activity', {
                    sessionID: next.sessionID,
                    pubkeyPrefix: next.pubkeyPrefix,
                  });
                }}
                onViewActivity={goToActivityForSession}
              />
            ) : null}
            {tab === 'explorer' ? <ExplorerTab /> : null}
          </>
        )}
      </main>
    </div>
  );
}
