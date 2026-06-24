import { useState } from 'react';
import type { ActivityData } from '../lib/api';
import { formatTs } from '../lib/hooks';
import { DataTable, Section } from './ui';

const EVENT_FAMILIES = [
  { value: '', label: 'All events' },
  { value: 'session.', label: 'Session' },
  { value: 'challenge.', label: 'Challenge' },
  { value: 'online.', label: 'ONLINE' },
  { value: 'client.', label: 'Client' },
  { value: 'nostr.', label: 'Nostr' },
  { value: 'deposit.', label: 'Deposit' },
];

export function ActivityTab({
  data,
  onFilterChange,
}: {
  data: ActivityData;
  onFilterChange: (filters: { event?: string; outcome?: string }) => void;
}) {
  const [eventPrefix, setEventPrefix] = useState('');
  const [outcome, setOutcome] = useState('');

  const applyFilters = () => {
    onFilterChange({
      event: eventPrefix || undefined,
      outcome: outcome || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-surface-border bg-surface-raised p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Event family</span>
          <select
            className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={eventPrefix}
            onChange={(e) => setEventPrefix(e.target.value)}
          >
            {EVENT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Outcome</span>
          <select
            className="rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All</option>
            <option value="ok">ok</option>
            <option value="reject">reject</option>
            <option value="error">error</option>
          </select>
        </label>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/30"
        >
          Apply filters
        </button>
      </div>

      <Section title={`Recent events (${data.events.length})`}>
        <DataTable
          columns={[
            {
              key: 'ts',
              label: 'Time',
              render: (r) => formatTs(String(r.ts)),
            },
            { key: 'event', label: 'Event' },
            {
              key: 'outcome',
              label: 'Outcome',
              render: (r) => (
                <span
                  className={
                    r.outcome === 'ok'
                      ? 'text-sky-400'
                      : r.outcome === 'reject'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }
                >
                  {String(r.outcome)}
                </span>
              ),
            },
            { key: 'reason', label: 'Reason' },
            { key: 'sessionID', label: 'Session' },
            { key: 'source', label: 'Source' },
          ]}
          rows={data.events as unknown as Array<Record<string, unknown>>}
          empty="No events yet — play a match to populate"
        />
      </Section>
    </div>
  );
}
