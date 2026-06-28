import type { QuickMatchData } from '../lib/api';
import { DataTable, KpiCard, Section } from './ui';

export function QuickMatchTab({ data }: { data: QuickMatchData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Starts" value={data.started} accent />
        <KpiCard label="Completions" value={data.completed} />
        <KpiCard label="Completion rate" value={`${data.completionRate}%`} />
        <KpiCard
          label="Avg duration"
          value={data.avgDurationMs > 0 ? `${Math.round(data.avgDurationMs / 1000)}s` : '—'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="By mode">
          <DataTable
            columns={[
              { key: 'mode', label: 'Mode' },
              { key: 'count', label: 'Configured' },
            ]}
            rows={Object.entries(data.byMode).map(([mode, count]) => ({
              mode,
              count,
            }))}
            rowKey={(r) => String(r.mode)}
            empty="No quick match data"
          />
        </Section>
        <Section title="By opponent">
          <DataTable
            columns={[
              { key: 'opponent', label: 'Opponent' },
              { key: 'count', label: 'Configured' },
            ]}
            rows={Object.entries(data.byOpponentType).map(([opponent, count]) => ({
              opponent,
              count,
            }))}
            rowKey={(r) => String(r.opponent)}
            empty="No opponent breakdown"
          />
        </Section>
      </div>
    </div>
  );
}
