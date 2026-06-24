import type { OverviewData } from '../lib/api';
import { formatBytes, formatUptime } from '../lib/hooks';
import { KpiCard, Section } from './ui';

export function OverviewTab({ data }: { data: OverviewData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Connected sessions" value={data.connectedSessions} accent />
        <KpiCard label="Active ONLINE rooms" value={data.activeOnlineRooms} />
        <KpiCard label="Challenge runs (ok)" value={data.challengeRunsToday} />
        <KpiCard
          label="Bounty paid today"
          value={`${data.bountyPaidTodaySats.toLocaleString()} sats`}
          hint={`${data.bountyRemainingSats.toLocaleString()} remaining of ${data.bountyCapSats.toLocaleString()} cap`}
        />
        <KpiCard label="Pending zap claims" value={data.pendingZapClaims} />
        <KpiCard label="Server uptime" value={formatUptime(data.serverUptimeSec)} />
        <KpiCard label="Event log size" value={formatBytes(data.eventLogBytes)} />
      </div>

      <Section title="Health">
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-slate-400">
          <p>
            Snapshot at <span className="text-slate-300">{new Date(data.fetchedAt).toLocaleString()}</span>
          </p>
          <p className="mt-2">
            Bounty budget:{' '}
            <span className="text-accent">
              {data.bountyPaidTodaySats.toLocaleString()} / {data.bountyCapSats.toLocaleString()} sats
            </span>{' '}
            used today
          </p>
        </div>
      </Section>
    </div>
  );
}
