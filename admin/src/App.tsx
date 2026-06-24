import { useCallback, useEffect, useState } from 'react';
import {
  checkAuth,
  fetchActivity,
  fetchChallenges,
  fetchFunnels,
  fetchOnline,
  fetchOverview,
  fetchSessions,
  logout,
} from './lib/api';
import { usePolling } from './lib/hooks';
import { LoginScreen } from './components/LoginScreen';
import { OverviewTab } from './components/OverviewTab';
import { FunnelsTab } from './components/FunnelsTab';
import { ChallengeTab } from './components/ChallengeTab';
import { OnlineTab } from './components/OnlineTab';
import { ActivityTab } from './components/ActivityTab';
import { SessionsTab } from './components/SessionsTab';
import { ErrorBanner } from './components/ui';

type Tab = 'overview' | 'funnels' | 'challenge' | 'online' | 'activity' | 'sessions';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'funnels', label: 'Funnels' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'online', label: 'ONLINE' },
  { id: 'activity', label: 'Activity' },
  { id: 'sessions', label: 'Sessions' },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activityFilters, setActivityFilters] = useState<{ event?: string; outcome?: string }>({});

  useEffect(() => {
    void checkAuth().then(setAuthed);
  }, []);

  const overview = usePolling(fetchOverview, authed === true && tab === 'overview' && autoRefresh, 15000);
  const funnels = usePolling(fetchFunnels, authed === true && tab === 'funnels' && autoRefresh, 15000);
  const challenges = usePolling(fetchChallenges, authed === true && tab === 'challenge' && autoRefresh, 15000);
  const online = usePolling(fetchOnline, authed === true && tab === 'online' && autoRefresh, 15000);
  const sessions = usePolling(fetchSessions, authed === true && tab === 'sessions' && autoRefresh, 15000);

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

  const activePoll =
    tab === 'overview'
      ? overview
      : tab === 'funnels'
        ? funnels
        : tab === 'challenge'
          ? challenges
          : tab === 'online'
            ? online
            : tab === 'activity'
              ? activity
              : sessions;

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
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
              onClick={() => setTab(t.id)}
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
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            {tab === 'overview' && overview.data ? (
              <OverviewTab data={overview.data} />
            ) : null}
            {tab === 'funnels' && funnels.data ? <FunnelsTab data={funnels.data} /> : null}
            {tab === 'challenge' && challenges.data ? (
              <ChallengeTab data={challenges.data} />
            ) : null}
            {tab === 'online' && online.data ? <OnlineTab data={online.data} /> : null}
            {tab === 'activity' && activity.data ? (
              <ActivityTab data={activity.data} onFilterChange={setActivityFilters} />
            ) : null}
            {tab === 'sessions' && sessions.data ? <SessionsTab data={sessions.data} /> : null}
          </>
        )}
      </main>
    </div>
  );
}
