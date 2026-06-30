import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '../lib/chartTheme';
import type { ChallengesData, PlayerIdentity } from '../lib/api';
import { formatTs } from '../lib/hooks';
import { DataTable, KpiCard, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';

export function ChallengeTab({
  data,
  hideBrowseFunnel,
}: {
  data: ChallengesData;
  hideBrowseFunnel?: boolean;
}) {
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

      {data.browseFunnel && !hideBrowseFunnel ? (
        <Section title="Browse → claim funnel">
          <DataTable
            columns={[
              { key: 'step', label: 'Step' },
              { key: 'ok', label: 'OK' },
              { key: 'total', label: 'Total' },
              { key: 'passRate', label: 'Pass %' },
            ]}
            rows={Object.entries(data.browseFunnel).map(([step, row]) => ({
              step: step.replace(/^client\.challenge\.|^challenge\./, ''),
              ok: row.ok,
              total: row.total,
              passRate: row.passRate,
            }))}
            rowKey={(r) => String(r.step)}
            empty="No browse funnel data"
          />
        </Section>
      ) : null}

      {data.dailySpendSeries.length > 0 ? (
        <Section title="Bounty spend (7 days)">
          <div className="panel h-48 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailySpendSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="day" tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: CHART_COLORS.muted, fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="sats" fill={CHART_COLORS.primary} name="sats" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      ) : null}

      {data.difficulty && data.difficulty.challenges.length > 0 ? (
        <Section title={`Challenge difficulty (≥${data.difficulty.minRunsThreshold} runs)`}>
          <DataTable
            columns={[
              { key: 'challengeId', label: 'Challenge' },
              { key: 'runs', label: 'Runs' },
              { key: 'completions', label: 'Completions' },
              { key: 'completionRate', label: 'Complete %' },
              { key: 'claimRate', label: 'Claim %' },
            ]}
            rows={data.difficulty.challenges.map((c) => ({
              ...c,
              completionRate: c.completionRate != null ? `${c.completionRate}%` : '—',
              claimRate: c.claimRate != null ? `${c.claimRate}%` : '—',
            }))}
            rowKey={(r) => String(r.challengeId)}
            empty="Not enough runs per challenge"
          />
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
          rowKey={(r) => String(r.challengeId)}
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
          rowKey={(r) => `${r.challengeId}-${r.reason}`}
          empty="No replay failures"
        />
      </Section>

      <Section title="Pending zap claims">
        <DataTable
          columns={[
            {
              key: 'identity',
              label: 'Player',
              sortable: false,
              render: (r) =>
                r.identity ? (
                  <PlayerIdentityCell identity={r.identity as PlayerIdentity} />
                ) : (
                  '—'
                ),
            },
            { key: 'challengeId', label: 'Challenge' },
            { key: 'bountySats', label: 'Sats' },
            {
              key: 'publishedAt',
              label: 'Published',
              render: (r) => formatTs(r.publishedAt as string | number | null | undefined),
            },
          ]}
          rows={data.pendingZaps as unknown as Array<Record<string, unknown>>}
          rowKey={(r) => `${r.challengeId}-${r.runId}`}
          empty="No pending zaps"
        />
      </Section>

      <Section title="Recent paid claims">
        <DataTable
          columns={[
            {
              key: 'identity',
              label: 'Player',
              sortable: false,
              render: (r) =>
                r.identity ? (
                  <PlayerIdentityCell identity={r.identity as PlayerIdentity} />
                ) : (
                  '—'
                ),
            },
            { key: 'challengeId', label: 'Challenge' },
            { key: 'bountySats', label: 'Sats' },
            {
              key: 'zapPaidAt',
              label: 'Paid at',
              render: (r) => formatTs(r.zapPaidAt as string | number | null | undefined),
            },
          ]}
          rows={data.recentClaims}
          rowKey={(r, i) => `${r.challengeId}-${i}`}
          empty="No claims yet"
        />
      </Section>
    </div>
  );
}
