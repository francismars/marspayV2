import type { ActivityData, ActivityFilters, FunnelsData } from '../lib/api';
import { ActivityTab } from './ActivityTab';
import { FunnelsTab } from './FunnelsTab';
import { SubNav } from './SubNav';

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
      <SubNav
        items={[
          { id: 'activity', label: 'Activity log' },
          { id: 'funnels', label: 'Advanced funnels' },
        ]}
        active={section}
        onChange={onSectionChange}
        breadcrumb="Debug"
      />

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
