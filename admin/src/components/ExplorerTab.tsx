import { useState } from 'react';
import { fetchJourney, type JourneyData } from '../lib/api';
import { formatTs } from '../lib/hooks';
import { DataTable, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';

export function ExplorerTab() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'sessionID' | 'pubkey'>('sessionID');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section title="User Explorer (Tier B)">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Search by
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'sessionID' | 'pubkey')}
              className="rounded border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-slate-200"
            >
              <option value="sessionID">sessionID</option>
              <option value="pubkey">pubkey / npub / prefix</option>
            </select>
          </label>
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs text-slate-400">
            Query
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search();
              }}
              placeholder={kind === 'sessionID' ? '🍕:abc123…' : 'npub1… or pubkey prefix'}
              className="rounded border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <button
            type="button"
            onClick={() => void search()}
            disabled={loading}
            className="rounded border border-surface-border px-3 py-2 text-sm text-slate-200 hover:bg-surface-raised disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </Section>

      {data ? (
        <>
          <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-slate-300">
            <div>Events: {data.eventCount}</div>
            {data.pubkeyPrefix ? (
              <div className="mt-1 font-mono text-xs text-slate-500">
                pubkeyPrefix: {data.pubkeyPrefix}
              </div>
            ) : null}
            {data.sessionIDs.length > 0 ? (
              <div className="mt-1 font-mono text-xs text-slate-500">
                sessions: {data.sessionIDs.join(', ')}
              </div>
            ) : null}
            {data.identity ? (
              <div className="mt-2">
                <PlayerIdentityCell identity={data.identity} />
              </div>
            ) : null}
          </div>

          <Section title="Timeline">
            <DataTable
              columns={[
                {
                  key: 'ts',
                  label: 'Time',
                  render: (row) => formatTs(String(row.ts)),
                },
                { key: 'event', label: 'Event' },
                { key: 'outcome', label: 'Outcome' },
                { key: 'reason', label: 'Reason' },
                { key: 'sessionID', label: 'Session' },
              ]}
              rows={data.timeline}
              rowKey={(r, i) => `${r.ts}-${r.event}-${i}`}
              empty="No events found"
            />
          </Section>
        </>
      ) : null}
    </div>
  );
}
