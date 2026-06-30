import type { ActivityData, ActivityFilters, FunnelsData } from '../lib/api';
import { ActivityTab } from './ActivityTab';
import { FunnelsTab } from './FunnelsTab';

export function DebugTab({
  section,
  onSectionChange,
  activity,
  activityFilters,
  onActivityFilterChange,
  onSessionClick,
  funnels,
  funnelWindow,
  onFunnelWindowChange,
}: {
  section: 'activity' | 'funnels';
  onSectionChange: (s: 'activity' | 'funnels') => void;
  activity: ActivityData;
  activityFilters: ActivityFilters;
  onActivityFilterChange: (f: ActivityFilters) => void;
  onSessionClick?: (sessionID: string) => void;
  funnels: FunnelsData;
  funnelWindow: 'lifetime' | '24h' | '7d';
  onFunnelWindowChange: (w: 'lifetime' | '24h' | '7d') => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['activity', 'Activity log'],
            ['funnels', 'Advanced funnels'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSectionChange(id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              section === id ? 'nav-pill-active border-accent/40' : 'border-surface-border text-white/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'activity' ? (
        <ActivityTab
          data={activity}
          filters={activityFilters}
          onFilterChange={onActivityFilterChange}
          onSessionClick={onSessionClick}
        />
      ) : (
        <FunnelsTab
          data={funnels}
          window={funnelWindow}
          onWindowChange={onFunnelWindowChange}
        />
      )}
    </div>
  );
}
