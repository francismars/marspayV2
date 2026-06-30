import { useCallback, useEffect, useState } from 'react';
import {
  checkAuth,
  fetchActivity,
  fetchChallenges,
  fetchCohorts,
  fetchFunnels,
  fetchHome,
  fetchLive,
  fetchLiveRecent,
  fetchModeFunnel,
  fetchMoney,
  fetchOnline,
  fetchP2p,
  fetchQuickMatch,
  fetchReplays,
  logout,
  type ActivityFilters,
  type DashboardAlert,
} from './lib/api';
import { usePolling } from './lib/hooks';
import { LoginScreen } from './components/LoginScreen';
import { HomeTab } from './components/HomeTab';
import { PlayersTab } from './components/PlayersTab';
import { ModesTab, type ModeId } from './components/ModesTab';
import { MoneyTab } from './components/MoneyTab';
import { DebugTab } from './components/DebugTab';
import { ChainDuelHeader } from './components/ChainDuelHeader';
import { ErrorBanner, LoadingState } from './components/ui';

type Tab = 'home' | 'players' | 'modes' | 'money' | 'debug';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'players', label: 'Players' },
  { id: 'modes', label: 'Modes' },
  { id: 'money', label: 'Money' },
  { id: 'debug', label: 'Debug' },
];

const LEGACY_TAB_MAP: Record<string, Tab> = {
  overview: 'home',
  visitors: 'home',
  funnels: 'debug',
  challenge: 'modes',
  quickmatch: 'modes',
  p2p: 'modes',
  online: 'modes',
  activity: 'debug',
  live: 'players',
  explorer: 'players',
};

const LEGACY_MODE_MAP: Record<string, ModeId> = {
  quickmatch: 'quickmatch',
  challenge: 'challenge',
  p2p: 'p2p',
  online: 'online',
};

function parseTabFromUrl(): Tab {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('tab');
  if (raw && TABS.some((t) => t.id === raw)) return raw as Tab;
  if (raw && LEGACY_TAB_MAP[raw]) return LEGACY_TAB_MAP[raw];
  return 'home';
}

function parseModeFromUrl(): ModeId {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode && mode in LEGACY_MODE_MAP) return LEGACY_MODE_MAP[mode]!;
  if (mode === 'nostr') return 'nostr';
  return 'quickmatch';
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

function syncUrl(
  tab: Tab,
  extras?: Record<string, string | undefined>
) {
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
  const [mode, setMode] = useState<ModeId>(() => parseModeFromUrl());
  const [debugSection, setDebugSection] = useState<'activity' | 'funnels'>('activity');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [funnelWindow, setFunnelWindow] = useState<'lifetime' | '24h' | '7d'>('24h');
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(() =>
    parseActivityFiltersFromUrl()
  );
  const [selectedSession, setSelectedSession] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });
  const [explorerQuery, setExplorerQuery] = useState<string | undefined>();
  const [explorerKind, setExplorerKind] = useState<'sessionID' | 'pubkey'>('sessionID');

  useEffect(() => {
    void checkAuth().then(setAuthed);
  }, []);

  const setTabWithUrl = useCallback(
    (next: Tab, extras?: Record<string, string | undefined>) => {
      setTab(next);
      if (next === 'debug') {
        syncUrl(next, {
          section: debugSection,
          event: activityFilters.event,
          outcome: activityFilters.outcome,
          since: activityFilters.since,
          sessionID: activityFilters.sessionID,
          pubkeyPrefix: activityFilters.pubkeyPrefix,
          roomCode: activityFilters.roomCode,
          ...extras,
        });
      } else if (next === 'players') {
        syncUrl(next, { session: selectedSession ?? undefined, ...extras });
      } else if (next === 'modes') {
        syncUrl(next, { mode, ...extras });
      } else {
        syncUrl(next, extras);
      }
    },
    [activityFilters, debugSection, mode, selectedSession]
  );

  const home = usePolling(fetchHome, authed === true && tab === 'home' && autoRefresh, 15000);
  const live = usePolling(fetchLive, authed === true && tab === 'players' && autoRefresh, 15000);
  const liveRecent = usePolling(
    () => fetchLiveRecent(24),
    authed === true && tab === 'players' && autoRefresh,
    30000
  );
  const cohorts = usePolling(
    () => fetchCohorts('7d'),
    authed === true && tab === 'players' && autoRefresh,
    60000
  );
  const modeFunnelFetcher = useCallback(
    () => fetchModeFunnel(mode, '24h'),
    [mode]
  );
  const modeFunnel = usePolling(
    modeFunnelFetcher,
    authed === true && tab === 'modes' && autoRefresh,
    15000
  );
  const quickmatch = usePolling(
    fetchQuickMatch,
    authed === true && tab === 'modes' && mode === 'quickmatch' && autoRefresh,
    15000
  );
  const challenges = usePolling(
    fetchChallenges,
    authed === true && (tab === 'modes' || tab === 'money') && autoRefresh,
    15000
  );
  const p2p = usePolling(
    fetchP2p,
    authed === true && tab === 'modes' && mode === 'p2p' && autoRefresh,
    15000
  );
  const online = usePolling(fetchOnline, authed === true && tab === 'modes' && mode === 'online' && autoRefresh, 15000);
  const replays = usePolling(
    fetchReplays,
    authed === true && tab === 'modes' && mode === 'online' && autoRefresh,
    30000
  );
  const money = usePolling(fetchMoney, authed === true && tab === 'money' && autoRefresh, 15000);

  const funnelsFetcher = useCallback(() => fetchFunnels(funnelWindow), [funnelWindow]);
  const funnels = usePolling(
    funnelsFetcher,
    authed === true && tab === 'debug' && debugSection === 'funnels' && autoRefresh,
    15000
  );

  const activityFetcher = useCallback(
    () => fetchActivity({ limit: 100, ...activityFilters }),
    [activityFilters]
  );
  const activity = usePolling(
    activityFetcher,
    authed === true && tab === 'debug' && debugSection === 'activity' && autoRefresh,
    10000
  );

  useEffect(() => {
    if (tab === 'debug' && authed) void activity.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFilters, tab, authed, debugSection]);

  useEffect(() => {
    if (tab === 'modes' && authed) void modeFunnel.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tab, authed]);

  useEffect(() => {
    if (tab === 'debug' && debugSection === 'funnels' && authed) void funnels.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelWindow, tab, authed, debugSection]);

  const handleActivityFilterChange = useCallback(
    (filters: ActivityFilters) => {
      setActivityFilters(filters);
      if (tab === 'debug') {
        syncUrl('debug', {
          section: 'activity',
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

  const goToActivity = useCallback(
    (partial: Partial<ActivityFilters>) => {
      const filters: ActivityFilters = { ...activityFilters, ...partial };
      setActivityFilters(filters);
      setDebugSection('activity');
      setTab('debug');
      syncUrl('debug', {
        section: 'activity',
        event: filters.event,
        outcome: filters.outcome,
        since: filters.since ?? '24h',
        sessionID: filters.sessionID,
        pubkeyPrefix: filters.pubkeyPrefix,
        roomCode: filters.roomCode,
      });
    },
    [activityFilters]
  );

  const goToPlayers = useCallback((sessionID?: string) => {
    if (sessionID) setSelectedSession(sessionID);
    setTab('players');
    syncUrl('players', { session: sessionID });
  }, []);

  const goToExplorer = useCallback((query: string, kind: 'sessionID' | 'pubkey' = 'sessionID') => {
    setExplorerQuery(query);
    setExplorerKind(kind);
    setTab('players');
    syncUrl('players', { session: undefined });
  }, []);

  const goToMode = useCallback((nextMode: string) => {
    const m = (LEGACY_MODE_MAP[nextMode] ?? nextMode) as ModeId;
    setMode(m);
    setTab('modes');
    syncUrl('modes', { mode: m });
  }, []);

  const handleAlertClick = useCallback(
    (alert: DashboardAlert) => {
      const d = alert.drillDown;
      if (!d) return;
      if (d.tab === 'money') setTabWithUrl('money');
      else if (d.tab === 'modes' && d.mode) goToMode(d.mode);
      else if (d.tab === 'debug' && d.event) goToActivity({ event: d.event, since: '24h' });
    },
    [goToActivity, goToMode, setTabWithUrl]
  );

  const activePoll =
    tab === 'home'
      ? home
      : tab === 'players'
        ? live
        : tab === 'modes'
          ? modeFunnel
          : tab === 'money'
            ? money
            : debugSection === 'activity'
              ? activity
              : funnels;

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/50">
        <LoadingState />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <ChainDuelHeader subtitle="Telemetry" />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-zinc-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-surface-border"
              />
              Live refresh
            </label>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <span
                className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-400' : 'bg-zinc-600'}`}
              />
              {activePoll.data?.fetchedAt
                ? `Updated ${new Date(activePoll.data.fetchedAt).toLocaleTimeString()}`
                : '—'}
            </span>
            <button
              type="button"
              onClick={() => void activePoll.refresh()}
              className="rounded border border-surface-border px-2 py-1 text-zinc-300 hover:border-accent hover:text-accent"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded border border-surface-border px-2 py-1 text-zinc-500 hover:text-zinc-300"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabWithUrl(t.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-2.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
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
            {tab === 'home' && home.data ? (
              <HomeTab
                data={home.data}
                onModeClick={goToMode}
                onAlertClick={handleAlertClick}
              />
            ) : null}
            {tab === 'players' && live.data ? (
              <PlayersTab
                live={live.data}
                recent={liveRecent.data}
                cohorts={cohorts.data}
                selectedSession={selectedSession}
                explorerQuery={explorerQuery}
                explorerKind={explorerKind}
                onSelectSession={setSelectedSession}
                onFilterActivity={(f) => goToActivity(f)}
                onViewActivity={(sid) => goToActivity({ sessionID: sid })}
                onExplorePlayer={(pk) => goToExplorer(pk, 'pubkey')}
              />
            ) : null}
            {tab === 'modes' ? (
              <ModesTab
                mode={mode}
                onModeChange={(m) => {
                  setMode(m);
                  syncUrl('modes', { mode: m });
                }}
                funnel={modeFunnel.data ?? null}
                quickmatch={quickmatch.data ?? undefined}
                challenges={challenges.data ?? undefined}
                p2p={p2p.data ?? undefined}
                online={online.data ?? undefined}
                replays={replays.data ?? undefined}
                onStepClick={(event) => goToActivity({ event, since: '24h' })}
                onSeatClick={goToPlayers}
              />
            ) : null}
            {tab === 'money' && money.data ? (
              <MoneyTab data={money.data} challenges={challenges.data ?? undefined} />
            ) : null}
            {tab === 'debug' ? (
              <DebugTab
                section={debugSection}
                onSectionChange={setDebugSection}
                activity={activity.data ?? { fetchedAt: '', events: [] }}
                activityFilters={activityFilters}
                onActivityFilterChange={handleActivityFilterChange}
                onSessionClick={goToPlayers}
                funnels={funnels.data ?? { fetchedAt: '', window: '24h', challenge: { steps: {}, topRejectReasons: {} }, online: { steps: {}, topRejectReasons: {} }, client: { steps: {}, uiErrors: [] } }}
                funnelWindow={funnelWindow}
                onFunnelWindowChange={setFunnelWindow}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
