import type { VisitorsData } from '../lib/api';
import { DataTable, KpiCard, Section } from './ui';

export function VisitorsTab({ data }: { data: VisitorsData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sessions (24h)"
          value={data.traffic.uniqueSessions24h}
          hint="Distinct socket sessions"
        />
        <KpiCard
          label="Visitors (24h est.)"
          value={data.traffic.uniqueVisitors24h}
          hint="Salted IP hash aggregate"
        />
        <KpiCard
          label="Sessions w/ context"
          value={data.sessionsWithContext}
          accent
        />
        <KpiCard
          label="Sessions w/ game activity"
          value={data.sessionsWithGameActivity}
          hint={`Window: ${data.hours}h`}
        />
      </div>

      <Section title="Menu choices">
        <DataTable
          columns={[
            { key: 'mode', label: 'Menu item' },
            { key: 'count', label: 'Clicks' },
          ]}
          rows={Object.entries(data.menuChoices).map(([mode, count]) => ({
            mode,
            count,
          }))}
          rowKey={(r) => String(r.mode)}
          empty="No menu selections yet"
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top referrers">
          <DataTable
            columns={[
              { key: 'referrer', label: 'Referrer' },
              { key: 'count', label: 'Sessions' },
            ]}
            rows={data.topReferrers}
            rowKey={(r) => String(r.referrer)}
            empty="No referrer data"
          />
        </Section>
        <Section title="Platforms">
          <DataTable
            columns={[
              { key: 'platform', label: 'Platform' },
              { key: 'count', label: 'Sessions' },
            ]}
            rows={data.topPlatforms}
            rowKey={(r) => String(r.platform)}
            empty="No platform data"
          />
        </Section>
      </div>
    </div>
  );
}
