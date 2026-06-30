import { useEffect, useState } from 'react';
import type { LiveData, LiveSessionDetail, RecentAttemptsData } from '../lib/api';
import { fetchLiveSession } from '../lib/api';
import { formatAge, formatTs } from '../lib/hooks';
import { DataTable, KpiCard, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';
import { PlayerDetailDrawer } from './PlayerDetailDrawer';

export function LiveTab({
  live,
  recent,
  selectedSession,
  onSelectSession,
  onFilterActivity,
  onViewActivity,
}: {
  live: LiveData;
  recent: RecentAttemptsData | null;
  selectedSession: string | null;
  onSelectSession: (sessionID: string | null) => void;
  onFilterActivity: (filters: { sessionID?: string; pubkeyPrefix?: string }) => void;
  onViewActivity: (sessionID: string) => void;
}) {
  const [detail, setDetail] = useState<LiveSessionDetail | null>(null);

  useEffect(() => {
    if (!selectedSession) {
      setDetail(null);
      return;
    }
    void fetchLiveSession(selectedSession)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedSession]);

  const openSession = (sessionID: string) => {
    onSelectSession(sessionID);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'live');
    params.set('session', sessionID);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Connected" value={live.total} accent />
        <KpiCard label="Nostr linked" value={live.nostrLinked} />
        <KpiCard label="In ONLINE room" value={live.inOnline} />
        <KpiCard label="In challenge" value={live.inChallenge} />
      </div>

      <Section title="Connected now">
        <DataTable
          columns={[
            {
              key: 'identity',
              label: 'Player',
              sortable: false,
              render: (r) => (
                <PlayerIdentityCell identity={r.identity as LiveData['sessions'][0]['identity']} />
              ),
            },
            {
              key: 'mode',
              label: 'Mode',
              render: (r) => {
                const ctx = r.context as LiveData['sessions'][0]['context'];
                return ctx.mode ?? 'idle';
              },
            },
            {
              key: 'context',
              label: 'Context',
              render: (r) => {
                const ctx = r.context as LiveData['sessions'][0]['context'];
                if (ctx.roomCode) {
                  return `${ctx.roomCode}${ctx.seatRole ? ` (${ctx.seatRole})` : ''}`;
                }
                if (ctx.challengeId) return ctx.challengeId;
                return '—';
              },
            },
            {
              key: 'lastEvent',
              label: 'Last event',
              render: (r) => {
                const ctx = r.context as LiveData['sessions'][0]['context'];
                if (!ctx.lastEvent) return '—';
                return `${ctx.lastEvent} (${ctx.lastOutcome ?? '?'})`;
              },
            },
            {
              key: 'lastSeenMs',
              label: 'Last seen',
              render: (r) => formatAge(Number(r.lastSeenMs)) + ' ago',
            },
          ]}
          rows={live.sessions as unknown as Array<Record<string, unknown>>}
          rowKey={(r) => String(r.sessionID)}
          onRowClick={(r) => openSession(String(r.sessionID))}
          empty="No connected sessions"
        />
      </Section>

      {recent ? (
        <Section title={`Recent attempts (${recent.hours}h)`}>
          <DataTable
            columns={[
              {
                key: 'identity',
                label: 'Identity',
                sortable: false,
                render: (r) => (
                  <PlayerIdentityCell
                    identity={
                      (r.identity as RecentAttemptsData['attempts'][0]['identity']) ?? {
                        kind: 'anon',
                      }
                    }
                  />
                ),
              },
              { key: 'challengeRuns', label: 'Runs' },
              { key: 'onlineJoins', label: 'Joins' },
              {
                key: 'lastTs',
                label: 'Last activity',
                render: (r) => formatTs(String(r.lastTs)),
              },
              {
                key: 'topRejectReason',
                label: 'Top reject',
                render: (r) =>
                  r.topRejectReason
                    ? `${r.topRejectReason} (${r.topRejectCount})`
                    : '—',
              },
            ]}
            rows={recent.attempts as unknown as Array<Record<string, unknown>>}
            rowKey={(r) => String(r.key)}
            onRowClick={(r) => {
              const sid = r.sessionID as string | undefined;
              const prefix = r.pubkeyPrefix as string | undefined;
              if (sid) {
                onFilterActivity({ sessionID: sid });
              } else if (prefix) {
                onFilterActivity({ pubkeyPrefix: prefix });
              }
            }}
            empty="No attempts in window"
          />
        </Section>
      ) : null}

      {detail && selectedSession ? (
        <PlayerDetailDrawer
          detail={detail}
          onClose={() => {
            onSelectSession(null);
            const params = new URLSearchParams(window.location.search);
            params.delete('session');
            window.history.replaceState(null, '', `?${params.toString()}`);
          }}
          onViewActivity={onViewActivity}
        />
      ) : null}
    </div>
  );
}
