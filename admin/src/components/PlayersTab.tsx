import { useState } from 'react';
import type { CohortData, JourneyData, LiveData, RecentAttemptsData } from '../lib/api';
import { fetchJourney } from '../lib/api';
import { formatTs } from '../lib/hooks';
import { LiveTab } from './LiveTab';
import { DataTable, KpiCard, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';

function ExplorerPanel({
  initialQuery,
  initialKind,
  onSessionFound,
}: {
  initialQuery?: string;
  initialKind?: 'sessionID' | 'pubkey';
  onSessionFound?: (sessionID: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [kind, setKind] = useState<'sessionID' | 'pubkey'>(initialKind ?? 'sessionID');
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJourney(
        kind === 'sessionID' ? { sessionID: trimmed } : { pubkey: trimmed }
      );
      setData(result);
      if (result.sessionIDs[0]) onSessionFound?.(result.sessionIDs[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-white/45">
          Search by
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'sessionID' | 'pubkey')}
            className="rounded border border-surface-border bg-black/40 px-2 py-1.5 text-sm text-white/90"
          >
            <option value="sessionID">sessionID</option>
            <option value="pubkey">pubkey / npub / prefix</option>
          </select>
        </label>
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs text-white/45">
          Query
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            placeholder={kind === 'sessionID' ? 'session id…' : 'npub1… or prefix'}
            className="rounded border border-surface-border bg-black/40 px-2 py-1.5 text-sm text-white/90"
          />
        </label>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="rounded border border-surface-border px-3 py-2 text-sm text-white/90 hover:border-accent/50 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {data ? (
        <DataTable
          columns={[
            { key: 'ts', label: 'Time', render: (r) => formatTs(String(r.ts)) },
            { key: 'event', label: 'Event' },
            { key: 'outcome', label: 'Outcome' },
            { key: 'reason', label: 'Reason' },
          ]}
          rows={data.timeline as unknown as Array<Record<string, unknown>>}
          rowKey={(r, i) => `${r.ts}-${i}`}
          empty="No events"
        />
      ) : null}
    </div>
  );
}

export function PlayersTab({
  live,
  recent,
  cohorts,
  selectedSession,
  explorerQuery,
  explorerKind,
  onSelectSession,
  onFilterActivity,
  onViewActivity,
  onExplorePlayer,
}: {
  live: LiveData;
  recent: RecentAttemptsData | null;
  cohorts?: CohortData | null;
  selectedSession: string | null;
  explorerQuery?: string;
  explorerKind?: 'sessionID' | 'pubkey';
  onSelectSession: (sessionID: string | null) => void;
  onFilterActivity: (filters: { sessionID?: string; pubkeyPrefix?: string }) => void;
  onViewActivity: (sessionID: string) => void;
  onExplorePlayer?: (pubkeyPrefix: string) => void;
}) {
  const [section, setSection] = useState<'recent' | 'live' | 'explorer' | 'cohorts'>('recent');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['recent', 'Recent (24h)'],
            ['live', 'Connected now'],
            ['explorer', 'Explorer'],
            ['cohorts', 'Cohorts'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              section === id ? 'nav-pill-active border-accent/40' : 'border-surface-border text-white/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'recent' && recent ? (
        <Section title="Recent attempts (24h)">
          <DataTable
            columns={[
              {
                key: 'identity',
                label: 'Player',
                sortable: false,
                render: (r) =>
                  r.identity ? (
                    <PlayerIdentityCell
                      identity={r.identity as NonNullable<RecentAttemptsData['attempts'][0]['identity']>}
                    />
                  ) : (
                    String(r.pubkeyPrefix ?? r.sessionID ?? '—')
                  ),
              },
              { key: 'lastEvent', label: 'Last event' },
              { key: 'lastOutcome', label: 'Outcome' },
              {
                key: 'lastTs',
                label: 'When',
                render: (r) => formatTs(String(r.lastTs)),
              },
            ]}
            rows={recent.attempts as unknown as Array<Record<string, unknown>>}
            rowKey={(r) => String(r.key)}
            onRowClick={(row) => {
              const sid = row.sessionID as string | undefined;
              const pk = row.pubkeyPrefix as string | undefined;
              if (sid) {
                onSelectSession(sid);
                setSection('live');
              } else if (pk && onExplorePlayer) {
                onExplorePlayer(pk);
                setSection('explorer');
              }
            }}
            empty="No recent attempts"
          />
        </Section>
      ) : null}

      {section === 'live' ? (
        <LiveTab
          live={live}
          recent={null}
          selectedSession={selectedSession}
          onSelectSession={onSelectSession}
          onFilterActivity={onFilterActivity}
          onViewActivity={onViewActivity}
        />
      ) : null}

      {section === 'explorer' ? (
        <Section title="User Explorer (Tier B)">
          <ExplorerPanel
            initialQuery={explorerQuery}
            initialKind={explorerKind}
            onSessionFound={(sid) => onSelectSession(sid)}
          />
        </Section>
      ) : null}

      {section === 'cohorts' && cohorts ? (
        <div className="space-y-6">
          <p className="text-xs text-white/45">{cohorts.tierBNote}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="Nostr players" value={cohorts.newNostrPlayers} window="7d" />
            <KpiCard label="Return rate" value={`${cohorts.returnRate}%`} window="7d" />
            <KpiCard label="Returning" value={cohorts.returningPlayers} window="7d" />
          </div>
          <Section title="First game mode">
            <DataTable
              columns={[
                { key: 'mode', label: 'Mode' },
                { key: 'count', label: 'Players' },
              ]}
              rows={Object.entries(cohorts.firstGameModeDistribution).map(([mode, count]) => ({
                mode,
                count,
              }))}
              rowKey={(r) => String(r.mode)}
              empty="No cohort data"
            />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
