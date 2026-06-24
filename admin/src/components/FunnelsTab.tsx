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
            />
            <Bar dataKey="ok" stackId="a" fill="#38bdf8" name="ok" />
            <Bar dataKey="reject" stackId="a" fill="#f87171" name="reject" />
            <Bar dataKey="error" stackId="a" fill="#fbbf24" name="error" />
          </BarChart>
        </ResponsiveContainer>
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
        empty="No rejections recorded"
      />
    </Section>
  );
}

export function FunnelsTab({ data }: { data: FunnelsData }) {
  return (
    <div className="space-y-8">
      <FunnelChart title="Challenge funnel" steps={data.challenge.steps} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RejectTable title="Eligibility rejections" rows={data.challenge.topRejectReasons.eligibility ?? []} />
        <RejectTable title="Run rejections" rows={data.challenge.topRejectReasons.run ?? []} />
      </div>

      <FunnelChart title="ONLINE funnel" steps={data.online.steps} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RejectTable title="Seat payment rejections" rows={data.online.topRejectReasons.seatPaid ?? []} />
        <RejectTable title="Join rejections" rows={data.online.topRejectReasons.joined ?? []} />
      </div>

      <FunnelChart title="Client beacons" steps={data.client.steps} />
      <RejectTable title="UI errors" rows={data.client.uiErrors} />
    </div>
  );
}
