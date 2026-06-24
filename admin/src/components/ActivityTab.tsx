import { useCallback, useEffect, useState } from 'react';
import type { ActivityFilters, ActivityData } from '../lib/api';
import { exportActivity } from '../lib/api';
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

const SINCE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: '1h', label: 'Last 1h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
];

export function ActivityTab({
  data,
  filters,
  onFilterChange,
  onSessionClick,
}: {
  data: ActivityData;
  filters: ActivityFilters;
  onFilterChange: (filters: ActivityFilters) => void;
  onSessionClick?: (sessionID: string) => void;
}) {
  const [eventPrefix, setEventPrefix] = useState(filters.event ?? '');
  const [outcome, setOutcome] = useState(filters.outcome ?? '');
  const [since, setSince] = useState<ActivityFilters['since']>(filters.since);
  const [sessionID, setSessionID] = useState(filters.sessionID ?? '');
  const [pubkeyPrefix, setPubkeyPrefix] = useState(filters.pubkeyPrefix ?? '');
  const [roomCode, setRoomCode] = useState(filters.roomCode ?? '');

  useEffect(() => {
    setEventPrefix(filters.event ?? '');
    setOutcome(filters.outcome ?? '');
    setSince(filters.since);
    setSessionID(filters.sessionID ?? '');
    setPubkeyPrefix(filters.pubkeyPrefix ?? '');
    setRoomCode(filters.roomCode ?? '');
  }, [filters]);

  const applyDebounced = useCallback(() => {
    const t = setTimeout(() => {
      onFilterChange({
        event: eventPrefix || undefined,
        outcome: outcome || undefined,
        since: since || undefined,
        sessionID: sessionID.trim() || undefined,
        pubkeyPrefix: pubkeyPrefix.trim() || undefined,
        roomCode: roomCode.trim() || undefined,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [eventPrefix, outcome, since, sessionID, pubkeyPrefix, roomCode, onFilterChange]);

  useEffect(() => applyDebounced(), [applyDebounced]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Event family</span>
          <select
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
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
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All</option>
            <option value="ok">ok</option>
            <option value="reject">reject</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Time window</span>
          <select
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={since ?? ''}
            onChange={(e) =>
              setSince((e.target.value || undefined) as ActivityFilters['since'])
            }
          >
            {SINCE_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Session ID</span>
          <input
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={sessionID}
            onChange={(e) => setSessionID(e.target.value)}
            placeholder="emoji:…"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Pubkey prefix</span>
          <input
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={pubkeyPrefix}
            onChange={(e) => setPubkeyPrefix(e.target.value)}
            placeholder="12 hex chars"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-400">Room code</span>
          <input
            className="w-full rounded border border-surface-border bg-surface px-2 py-1.5 text-sm text-slate-200"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
          />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void exportActivity(filters, 'csv')}
          className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-300"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => void exportActivity(filters, 'json')}
          className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-300"
        >
          Export JSON
        </button>
      </div>

      <Section title={`Recent events (${data.events.length})`}>
        <DataTable
          columns={[
            { key: 'ts', label: 'Time', render: (r) => formatTs(String(r.ts)) },
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
            { key: 'pubkeyPrefix', label: 'Pubkey' },
            { key: 'roomCode', label: 'Room' },
            { key: 'challengeId', label: 'Challenge' },
            { key: 'source', label: 'Source' },
          ]}
          rows={data.events as unknown as Array<Record<string, unknown>>}
          rowKey={(r) => `${r.ts}-${r.event}-${r.sessionID ?? ''}`}
          onRowClick={
            onSessionClick && data.events.some((e) => e.sessionID)
              ? (r) => {
                  const sid = r.sessionID as string | undefined;
                  if (sid) onSessionClick(sid);
                }
              : undefined
          }
          empty="No events yet — play a match to populate"
        />
      </Section>
    </div>
  );
}
