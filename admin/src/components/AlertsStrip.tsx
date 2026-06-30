import type { DashboardAlert } from '../lib/api';

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
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={onAlertClick ? () => onAlertClick(alert) : undefined}
          className={`glass-panel w-full rounded-lg px-4 py-2 text-left text-sm backdrop-blur-sm ${
            alert.severity === 'error'
              ? 'border-red-500/40 text-red-200'
              : alert.severity === 'warn'
                ? 'border-amber-500/40 text-amber-200'
                : 'border-surface-border text-white/70'
          } ${onAlertClick ? 'cursor-pointer hover:border-accent/40' : ''}`}
        >
          {alert.message}
        </button>
      ))}
    </div>
  );
}
