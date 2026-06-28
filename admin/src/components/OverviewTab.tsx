import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OverviewData } from '../lib/api';
import { formatBytes, formatUptime } from '../lib/hooks';
import {
  CollapsibleSection,
  DataTable,
  ErrorBanner,
  KpiCard,
  ProgressBar,
  SnapshotAge,
  Section,
} from './ui';

const CHART_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171'];

function buildCountryChartData(traffic: OverviewData['traffic']) {
  const topCountries = traffic.topCountries24h.slice(0, 5).map((c) => c.country);
  if (topCountries.length === 0 && traffic.countrySeries7d.length > 0) {
    const counts = new Map<string, number>();
    for (const row of traffic.countrySeries7d) {
      for (const [country, n] of Object.entries(row.countries)) {
        counts.set(country, (counts.get(country) ?? 0) + n);
      }
    }
    topCountries.push(
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)
    );
  }
  return traffic.countrySeries7d.map((row) => {
    const point: Record<string, string | number> = { day: row.day.slice(5) };
    for (const country of topCountries) {
      point[country] = row.countries[country] ?? 0;
    }
    return point;
  });
}

export function OverviewTab({ data }: { data: OverviewData }) {
  const bountyWarn = data.bountyCapPct >= 80;
  const traffic = data.traffic;
  const chartData = buildCountryChartData(traffic);
  const chartCountries =
    traffic.topCountries24h.length > 0
      ? traffic.topCountries24h.slice(0, 5).map((c) => c.country)
      : chartData.length > 0
        ? Object.keys(chartData[0]).filter((k) => k !== 'day')
        : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-sm">
        <SnapshotAge fetchedAt={data.fetchedAt} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KpiCard label="Connected sessions" value={data.connectedSessions} hint="live now" accent />
        <KpiCard label="Active ONLINE rooms" value={data.activeOnlineRooms} />
        <KpiCard
          label="Challenge runs (lifetime)"
          value={data.challengeRunsTotal}
          hint="Funnel counter since deploy"
        />
        <KpiCard
          label="Challenge runs (24h)"
          value={data.challengeRuns24h}
          hint="From event log"
        />
        <KpiCard
          label="Bounty paid today"
          value={`${data.bountyPaidTodaySats.toLocaleString()} sats`}
          hint={`${data.bountyRemainingSats.toLocaleString()} remaining of ${data.bountyCapSats.toLocaleString()} cap`}
          warn={bountyWarn}
        />
        <KpiCard
          label="Sessions w/ game (24h)"
          value={data.sessionsWithGameActivity24h ?? 0}
          hint="Quick match, challenge, P2P, or ONLINE seat"
        />
        <KpiCard label="Pending zap claims" value={data.pendingZapClaims} />
        <KpiCard label="Server uptime" value={formatUptime(data.serverUptimeSec)} />
        <KpiCard label="Event log size" value={formatBytes(data.eventLogBytes)} />
      </div>

      <Section title="Bounty cap">
        <div className="space-y-2 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div className="flex justify-between text-sm text-slate-400">
            <span>
              {data.bountyPaidTodaySats.toLocaleString()} / {data.bountyCapSats.toLocaleString()} sats
            </span>
            <span className={bountyWarn ? 'text-amber-400' : 'text-slate-300'}>
              {data.bountyCapPct}%
            </span>
          </div>
          <ProgressBar pct={data.bountyCapPct} />
        </div>
      </Section>

      <CollapsibleSection title="Traffic (24h)">
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <div className="text-xs uppercase text-slate-500">Unique sessions (24h)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {traffic.uniqueSessions24h}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Unique visitors (24h)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {traffic.uniqueVisitors24h}
            </div>
            <div className="text-xs text-slate-500">by IP hash, not exact users</div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-500">Geo coverage</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {traffic.geoCoveragePct}%
            </div>
          </div>
        </div>

        {traffic.geoWarning ? (
          <ErrorBanner message="Most traffic shows unknown country — enable CF-IPCountry (see TELEMETRY.md)" />
        ) : null}

        {traffic.connectedNowByCountry.length > 0 ? (
          <div className="text-sm text-slate-400">
            Connected now by country:{' '}
            {traffic.connectedNowByCountry
              .map((c) => `${c.country} (${c.count})`)
              .join(', ')}
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-300">Top countries (24h)</h3>
          <DataTable
            columns={[
              { key: 'country', label: 'Country' },
              { key: 'sessions', label: 'Sessions' },
              { key: 'uniqueVisitors', label: 'Unique visitors' },
            ]}
            rows={traffic.topCountries24h as unknown as Array<Record<string, unknown>>}
            rowKey={(r) => String(r.country)}
            empty="No traffic recorded yet"
            pageSize={10}
          />
        </div>

        {chartData.length > 0 && chartCountries.length > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-300">Sessions by country (7d)</h3>
            <div className="h-48 rounded-lg border border-surface-border bg-surface p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
                  <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1a2332',
                      border: '1px solid #2d3a4f',
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  {chartCountries.map((country, i) => (
                    <Bar
                      key={country}
                      dataKey={country}
                      stackId="a"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      name={country}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          Country from Cloudflare when enabled; otherwise unknown. No raw IPs stored.{' '}
          {traffic.rollupRetentionNote}
        </p>
      </CollapsibleSection>

      <Section title="Health">
        <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-slate-400">
          <p>
            Snapshot at{' '}
            <span className="text-slate-300">{new Date(data.fetchedAt).toLocaleString()}</span>
          </p>
        </div>
      </Section>
    </div>
  );
}
