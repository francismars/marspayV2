import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FunnelsData, FunnelStep } from '../lib/api';
import { DataTable, Section } from './ui';

function shortEventName(event: string): string {
  return event.replace(/^(challenge|online|client)\./, '');
}

function FunnelChart({ title, steps }: { title: string; steps: Record<string, FunnelStep> }) {
  const chartData = Object.entries(steps).map(([event, step]) => ({
    name: shortEventName(event),
    ok: step.ok,
    reject: step.reject,
    error: step.error,
    passRate: step.passRate,
  }));

  return (
    <Section title={title}>
      <div className="h-64 rounded-lg border border-surface-border bg-surface-raised p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" height={50} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1a2332', border: '1px solid #2d3a4f', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: number, name: string, props) => {
                if (name === 'passRate') return [`${props.payload.passRate}%`, 'pass rate'];
                return [value, name];
              }}
            />
            <Bar dataKey="ok" stackId="a" fill="#38bdf8" name="ok" />
            <Bar dataKey="reject" stackId="a" fill="#f87171" name="reject" />
            <Bar dataKey="error" stackId="a" fill="#fbbf24" name="error" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        {chartData.map((d) => (
          <span key={d.name} className="rounded bg-surface-raised px-2 py-1">
            {d.name}: {d.passRate}% pass
          </span>
        ))}
      </div>
    </Section>
  );
}

function RejectTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ reason: string; count: number }>;
}) {
  return (
    <Section title={title}>
      <DataTable
        columns={[
          { key: 'reason', label: 'Reason' },
          { key: 'count', label: 'Count' },
        ]}
        rows={rows}
        rowKey={(r) => String(r.reason)}
        empty="No rejections recorded"
      />
    </Section>
  );
}

const WINDOWS = [
  { id: 'lifetime' as const, label: 'Lifetime' },
  { id: '24h' as const, label: '24h' },
  { id: '7d' as const, label: '7d' },
];

export function FunnelsTab({
  data,
  window,
  onWindowChange,
}: {
  data: FunnelsData;
  window: 'lifetime' | '24h' | '7d';
  onWindowChange: (w: 'lifetime' | '24h' | '7d') => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onWindowChange(w.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              window === w.id
                ? 'bg-accent/20 text-accent'
                : 'text-slate-400 hover:bg-surface-raised'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <FunnelChart title={`Challenge funnel (${data.window})`} steps={data.challenge.steps} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RejectTable title="Eligibility rejections" rows={data.challenge.topRejectReasons.eligibility ?? []} />
        <RejectTable title="Run rejections" rows={data.challenge.topRejectReasons.run ?? []} />
        <RejectTable title="Win submit rejections" rows={data.challenge.topRejectReasons.winSubmit ?? []} />
        <RejectTable title="Claim rejections" rows={data.challenge.topRejectReasons.claim ?? []} />
      </div>

      <FunnelChart title={`ONLINE funnel (${data.window})`} steps={data.online.steps} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RejectTable title="Seat payment rejections" rows={data.online.topRejectReasons.seatPaid ?? []} />
        <RejectTable title="Join rejections" rows={data.online.topRejectReasons.joined ?? []} />
        <RejectTable title="Game start rejections" rows={data.online.topRejectReasons.gameStarted ?? []} />
      </div>

      {data.p2p ? (
        <FunnelChart title={`P2P funnel (${data.window})`} steps={data.p2p.steps} />
      ) : null}

      <FunnelChart title={`Client beacons (${data.window})`} steps={data.client.steps} />
      <RejectTable title="UI errors" rows={data.client.uiErrors} />
    </div>
  );
}
