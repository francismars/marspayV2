import type { DashboardAlert } from '../lib/api';

const SEVERITY_STYLES: Record<DashboardAlert['severity'], string> = {
  error: 'border-l-red-500 bg-red-950/30 text-red-200',
  warn: 'border-l-amber-500 bg-amber-950/20 text-amber-100',
  info: 'border-l-sky-500 bg-sky-950/20 text-sky-100',
};

const SEVERITY_LABEL: Record<DashboardAlert['severity'], string> = {
  error: 'Error',
  warn: 'Warning',
  info: 'Info',
};

export function AlertsStrip({
  alerts,
  onAlertClick,
}: {
  alerts: DashboardAlert[];
  onAlertClick?: (alert: DashboardAlert) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const className = `flex items-start gap-3 rounded-r-lg border border-surface-border border-l-4 px-3 py-2 text-sm ${SEVERITY_STYLES[alert.severity]} ${onAlertClick ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`;
        const content = (
          <>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-80">
              {SEVERITY_LABEL[alert.severity]}
            </span>
            <span className="flex-1">{alert.message}</span>
          </>
        );
        return onAlertClick ? (
          <button
            key={alert.id}
            type="button"
            onClick={() => onAlertClick(alert)}
            className={`w-full text-left ${className}`}
          >
            {content}
          </button>
        ) : (
          <div key={alert.id} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
