import type { LiveSessionDetail } from '../lib/api';
import { formatAge, formatTs } from '../lib/hooks';
import { technicalId } from '../lib/playerDisplay';
import { CollapsibleSection, DataTable, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';

export function PlayerDetailDrawer({
  detail,
  onClose,
  onViewActivity,
}: {
  detail: LiveSessionDetail;
  onClose: () => void;
  onViewActivity: (sessionID: string) => void;
}) {
  const tech = technicalId(detail.identity);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-surface-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Session detail</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-surface-border px-2 py-1 text-sm text-zinc-400"
          >
            Close
          </button>
        </div>

        <div className="mb-6">
          <PlayerIdentityCell identity={detail.identity} />
          {detail.identity.kind === 'nostr' && detail.identity.signerMode ? (
            <p className="mt-2 text-xs text-zinc-500">via {detail.identity.signerMode}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-400">
            Last seen {formatAge(detail.lastSeenMs)} ago
          </p>
        </div>

        <CollapsibleSection title="Technical IDs">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Session ID</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-zinc-300">{detail.sessionID}</dd>
            </div>
            {tech ? (
              <div>
                <dt className="text-xs text-zinc-500">Npub / prefix</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-zinc-300">{tech}</dd>
              </div>
            ) : null}
          </dl>
        </CollapsibleSection>

        {detail.context.roomCode || detail.context.challengeId ? (
          <div className="mt-6">
            <Section title="Context">
              <dl className="space-y-1 text-sm text-zinc-300">
                {detail.context.mode ? (
                  <div>
                    <dt className="inline text-zinc-500">Mode: </dt>
                    <dd className="inline">{detail.context.mode}</dd>
                  </div>
                ) : null}
                {detail.context.roomCode ? (
                  <div>
                    <dt className="inline text-zinc-500">Room: </dt>
                    <dd className="inline">{detail.context.roomCode}</dd>
                  </div>
                ) : null}
                {detail.context.seatRole ? (
                  <div>
                    <dt className="inline text-zinc-500">Seat: </dt>
                    <dd className="inline">{detail.context.seatRole}</dd>
                  </div>
                ) : null}
                {detail.context.challengeId ? (
                  <div>
                    <dt className="inline text-zinc-500">Challenge: </dt>
                    <dd className="inline">{detail.context.challengeId}</dd>
                  </div>
                ) : null}
              </dl>
            </Section>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewActivity(detail.sessionID)}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black"
          >
            View in Activity
          </button>
          {detail.lobbyUrl ? (
            <a
              href={detail.lobbyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-surface-border px-3 py-1.5 text-sm text-zinc-300"
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
