import type { SessionsData } from '../lib/api';
import { formatAge } from '../lib/hooks';
import { DataTable, KpiCard, Section } from './ui';

export function SessionsTab({ data }: { data: SessionsData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Connected" value={data.total} accent />
        <KpiCard label="Nostr linked" value={data.nostrLinked} />
        <KpiCard
          label="Anonymous"
          value={data.total - data.nostrLinked}
          hint="Sessions without app Nostr link"
        />
      </div>

      <Section title="Active sessions">
        <DataTable
          columns={[
            { key: 'sessionID', label: 'Session ID' },
            {
              key: 'nostrLinked',
              label: 'Nostr',
              render: (r) => (r.nostrLinked ? 'yes' : 'no'),
            },
            { key: 'pubkeyPrefix', label: 'Pubkey prefix' },
            { key: 'kind1Count', label: 'Kind1 notes' },
            {
              key: 'lastSeenMs',
              label: 'Last seen',
              render: (r) => formatAge(Number(r.lastSeenMs)) + ' ago',
            },
          ]}
          rows={data.sessions as unknown as Array<Record<string, unknown>>}
          empty="No connected sessions"
        />
      </Section>
    </div>
  );
}
