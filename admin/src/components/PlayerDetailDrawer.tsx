import type { LiveSessionDetail } from '../lib/api';
import { formatAge, formatTs } from '../lib/hooks';
import { DataTable, Section } from './ui';
import { NpubLink, PlayerIdentityCell } from './PlayerIdentityCell';

export function PlayerDetailDrawer({
  detail,
  onClose,
  onViewActivity,
}: {
  detail: LiveSessionDetail;
  onClose: () => void;
  onViewActivity: (sessionID: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-surface-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Session detail</h2>
            <p className="mt-1 break-all text-xs text-slate-500">{detail.sessionID}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-surface-border px-2 py-1 text-sm text-slate-400"
          >
            Close
          </button>
        </div>

        <div className="mb-6">
          <PlayerIdentityCell identity={detail.identity} />
          {detail.identity.kind === 'nostr' && detail.identity.npub ? (
            <div className="mt-2 text-sm">
              <NpubLink npub={detail.identity.npub} />
              {detail.identity.signerMode ? (
                <span className="ml-2 text-xs text-slate-500">via {detail.identity.signerMode}</span>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-sm text-slate-400">
            Last seen {formatAge(detail.lastSeenMs)} ago
          </p>
        </div>

        {detail.context.roomCode || detail.context.challengeId ? (
          <Section title="Context">
            <dl className="space-y-1 text-sm text-slate-300">
              {detail.context.mode ? (
                <div>
                  <dt className="inline text-slate-500">Mode: </dt>
                  <dd className="inline">{detail.context.mode}</dd>
                </div>
              ) : null}
              {detail.context.roomCode ? (
                <div>
                  <dt className="inline text-slate-500">Room: </dt>
                  <dd className="inline">{detail.context.roomCode}</dd>
                </div>
              ) : null}
              {detail.context.seatRole ? (
                <div>
                  <dt className="inline text-slate-500">Seat: </dt>
                  <dd className="inline">{detail.context.seatRole}</dd>
                </div>
              ) : null}
              {detail.context.challengeId ? (
                <div>
                  <dt className="inline text-slate-500">Challenge: </dt>
                  <dd className="inline">{detail.context.challengeId}</dd>
                </div>
              ) : null}
            </dl>
          </Section>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewActivity(detail.sessionID)}
            className="rounded bg-accent/20 px-3 py-1.5 text-sm text-accent"
          >
            View in Activity
          </button>
          {detail.lobbyUrl ? (
            <a
              href={detail.lobbyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-surface-border px-3 py-1.5 text-sm text-slate-300"
            >
              Open lobby
            </a>
          ) : null}
        </div>

        <div className="mt-6">
          <Section title="Recent events">
            <DataTable
              columns={[
                { key: 'ts', label: 'Time', render: (r) => formatTs(String(r.ts)) },
                { key: 'event', label: 'Event' },
                { key: 'outcome', label: 'Outcome' },
                { key: 'reason', label: 'Reason' },
              ]}
              rows={detail.recentEvents as unknown as Array<Record<string, unknown>>}
              rowKey={(r) => `${r.ts}-${r.event}`}
              empty="No recent events"
              pageSize={20}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
