import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChallengesData } from '../lib/api';
import { formatTs } from '../lib/hooks';
import { DataTable, KpiCard, Section } from './ui';

export function ChallengeTab({ data }: { data: ChallengesData }) {
  const byChallenge = Object.entries(data.stats.byChallenge).map(([id, row]) => ({
    challengeId: id,
    wins: row.wins,
    replayFailed: row.replayFailed,
  }));

  const replayReasonRows: Array<Record<string, unknown>> = [];
  for (const [challengeId, row] of Object.entries(data.stats.byChallenge)) {
    for (const [reason, count] of Object.entries(row.replayReasons)) {
      replayReasonRows.push({ challengeId, reason, count });
    }
  }
  replayReasonRows.sort((a, b) => Number(b.count) - Number(a.count));

  const capPct =
    data.bountyCapSats > 0
      ? Math.round((data.bountySpentTodaySats / data.bountyCapSats) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total wins" value={data.stats.totalWins} accent />
        <KpiCard label="Replay failures" value={data.stats.totalReplayFailed} />
        <KpiCard label="Pending zaps" value={data.pendingZaps.length} />
        <KpiCard
          label="Daily cap used"
          value={`${capPct}%`}
          hint={`${data.bountySpentTodaySats.toLocaleString()} / ${data.bountyCapSats.toLocaleString()} sats`}
        />
      </div>

      {data.dailySpendSeries.length > 0 ? (
        <Section title="Bounty spend (7 days)">
          <div className="h-48 rounded-lg border border-surface-border bg-surface-raised p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailySpendSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a2332', border: '1px solid #2d3a4f', borderRadius: 8 }}
                />
                <Bar dataKey="sats" fill="#38bdf8" name="sats" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      ) : null}

      <Section title="Per-challenge stats">
        <DataTable
          columns={[
            { key: 'challengeId', label: 'Challenge' },
            { key: 'wins', label: 'Wins' },
            { key: 'replayFailed', label: 'Replay failed' },
          ]}
          rows={byChallenge}
          empty="No challenge stats yet"
        />
      </Section>

      <Section title="Replay failure reasons">
        <DataTable
          columns={[
            { key: 'challengeId', label: 'Challenge' },
            { key: 'reason', label: 'Reason' },
            { key: 'count', label: 'Count' },
          ]}
          rows={replayReasonRows}
          empty="No replay failures"
        />
      </Section>

      <Section title="Pending zap claims">
        <DataTable
          columns={[
            { key: 'pubkey', label: 'Pubkey' },
            { key: 'challengeId', label: 'Challenge' },
            { key: 'bountySats', label: 'Sats' },
            {
              key: 'publishedAt',
              label: 'Published',
              render: (r) => formatTs(r.publishedAt as string | number | null | undefined),
            },
          ]}
          rows={data.pendingZaps as unknown as Array<Record<string, unknown>>}
          empty="No pending zaps"
        />
      </Section>

      <Section title="Recent paid claims">
        <DataTable
          columns={[
            { key: 'pubkey', label: 'Pubkey' },
            { key: 'challengeId', label: 'Challenge' },
            { key: 'bountySats', label: 'Sats' },
            {
              key: 'zapPaidAt',
              label: 'Paid at',
              render: (r) => formatTs(r.zapPaidAt as string | number | null | undefined),
            },
          ]}
          rows={data.recentClaims}
          empty="No claims yet"
        />
      </Section>
    </div>
  );
}
