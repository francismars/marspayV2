import type { ChallengesData, MoneyData, PlayerIdentity } from '../lib/api';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_TOOLTIP_STYLE, CHART_COLORS } from '../lib/chartTheme';
import { DataTable, KpiCard, ProgressBar, Section } from './ui';
import { PlayerIdentityCell } from './PlayerIdentityCell';

export function MoneyTab({ data, challenges }: { data: MoneyData; challenges?: ChallengesData }) {
  const capWarn = data.bountyCapPct >= 80;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Bounty paid today"
          value={`${data.bountySpentTodaySats.toLocaleString()} sats`}
          hint={`${data.bountyRemainingSats.toLocaleString()} remaining`}
          warn={capWarn}
          window="today"
        />
        <KpiCard label="Cap used" value={`${data.bountyCapPct}%`} warn={capWarn} />
        <KpiCard label="Pending zaps" value={data.pendingZapClaims} />
        <KpiCard label="P2P deposits" value={data.p2pDeposits} accent />
      </div>

      <Section title="Bounty cap">
        <div className="panel space-y-2 rounded-lg p-4">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>
              {data.bountySpentTodaySats.toLocaleString()} / {data.bountyCapSats.toLocaleString()}{' '}
              sats
            </span>
            <span className={capWarn ? 'text-amber-400' : 'text-zinc-300'}>
              {data.bountyCapPct}%
            </span>
          </div>
          <ProgressBar pct={data.bountyCapPct} />
        </div>
      </Section>

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

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="P2P withdrawals" value={data.p2pWithdrawals} />
        <KpiCard label="ONLINE payouts" value={data.onlinePayouts} />
        <KpiCard label="Challenge wins" value={data.challengeStats.totalWins} />
      </div>

      {challenges?.pendingZaps && challenges.pendingZaps.length > 0 ? (
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
            ]}
            rows={challenges.pendingZaps as unknown as Array<Record<string, unknown>>}
            rowKey={(r) => `${r.challengeId}-${r.runId}`}
          />
        </Section>
      ) : null}
    </div>
  );
}
