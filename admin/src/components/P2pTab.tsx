import type { P2pData } from '../lib/api';
import { DataTable, KpiCard, Section } from './ui';

export function P2pTab({ data }: { data: P2pData }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Configured" value={data.configured} />
        <KpiCard label="Deposits paid" value={data.depositsPaid} accent />
        <KpiCard label="Games finished (server)" value={data.gameFinished} />
        <KpiCard label="Withdrawals" value={data.withdrawals} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Client game started" value={data.gameStarted} />
        <KpiCard label="Client game completed" value={data.gameCompletedClient} />
        <KpiCard label="Double or nothing" value={data.doubleOrNothing} />
      </div>

      <Section title="Payment mode breakdown">
        <DataTable
          columns={[
            { key: 'mode', label: 'Mode' },
            { key: 'count', label: 'Configured' },
          ]}
          rows={Object.entries(data.byMode).map(([mode, count]) => ({ mode, count }))}
          rowKey={(r) => String(r.mode)}
          empty="No P2P configuration events"
        />
      </Section>
    </div>
  );
}
