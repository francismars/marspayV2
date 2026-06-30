import type { HomeData, DashboardAlert } from '../lib/api';
import { formatBytes, formatUptime } from '../lib/hooks';
import { AlertsStrip } from './AlertsStrip';
import {
  CollapsibleSection,
  DataTable,
  ErrorBanner,
  KpiCard,
  Section,
  SnapshotAge,
} from './ui';

export function HomeTab({
  data,
  onModeClick,
  onAlertClick,
}: {
  data: HomeData;
  onModeClick?: (mode: string) => void;
  onAlertClick?: (alert: DashboardAlert) => void;
}) {
  return (
    <div className="space-y-8">
      <SnapshotAge fetchedAt={data.fetchedAt} />

      <AlertsStrip alerts={data.alerts} onAlertClick={onAlertClick} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Activation rate"
          value={`${data.activation.rate}%`}
          hint={`${data.activation.sessionsWithGame} / ${data.activation.uniqueSessions} sessions`}
          accent
          window={data.window}
          trend={data.activation.trend}
        />
        {data.modeMetrics.map((m) => (
          <KpiCard
            key={m.mode}
            label={m.label}
            value={`${m.rate}%`}
            hint={`${m.numerator} / ${m.denominator}`}
            window={data.window}
            trend={m.trend}
          />
        ))}
      </div>

      <Section title="Top drop-offs">
        <div className="space-y-2">
          {data.modeMetrics.map((m) =>
            m.topDropOff ? (
              <button
                key={m.mode}
                type="button"
                onClick={() => onModeClick?.(m.mode)}
                className="panel flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-sm hover:border-accent/50"
              >
                <span className="text-zinc-300">{m.label}</span>
                <span className="text-amber-300">
                  {m.topDropOff.stepLabel} (−{m.topDropOff.dropPct}%)
                </span>
              </button>
            ) : (
              <div
                key={m.mode}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm text-white/40"
              >
                {m.label}: no drop-off data
              </div>
            )
          )}
        </div>
      </Section>

      <Section title="Acquisition">
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable
            columns={[
              { key: 'mode', label: 'Menu choice' },
              { key: 'count', label: 'Clicks' },
            ]}
            rows={Object.entries(data.acquisition.menuChoices).map(([mode, count]) => ({
              mode,
              count,
            }))}
            rowKey={(r) => String(r.mode)}
            empty="No menu selections yet"
          />
          <DataTable
            columns={[
              { key: 'referrer', label: 'Referrer' },
              { key: 'count', label: 'Sessions' },
            ]}
            rows={data.acquisition.topReferrers}
            rowKey={(r) => String(r.referrer)}
            empty="No referrer data"
          />
        </div>
        <p className="mt-2 text-xs text-white/40">
          Sessions with context: {data.acquisition.sessionsWithContext}
        </p>
      </Section>

      {data.system.geoWarning ? (
        <ErrorBanner message="Most traffic shows unknown country — enable CF-IPCountry (see TELEMETRY.md)" />
      ) : null}

      <CollapsibleSection title="System">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Connected now" value={data.system.connectedSessions} />
          <KpiCard label="Active ONLINE rooms" value={data.system.activeOnlineRooms} />
          <KpiCard label="Server uptime" value={formatUptime(data.system.serverUptimeSec)} />
          <KpiCard label="Event log size" value={formatBytes(data.system.eventLogBytes)} />
        </div>
      </CollapsibleSection>
    </div>
  );
}
