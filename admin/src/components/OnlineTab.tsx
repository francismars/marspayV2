import type { OnlineData } from '../lib/api';
import { formatAge } from '../lib/hooks';
import { DataTable, Section } from './ui';

export function OnlineTab({ data }: { data: OnlineData }) {
  return (
    <div className="space-y-8">
      <Section title={`Live rooms (${data.live.length})`}>
        <DataTable
          columns={[
            { key: 'roomCode', label: 'Code' },
            { key: 'phase', label: 'Phase' },
            { key: 'buyin', label: 'Buy-in' },
            {
              key: 'seatsPaid',
              label: 'Seats',
              render: (r) => `${r.seatsPaid}/${r.seatsTotal}`,
            },
            { key: 'spectators', label: 'Spectators' },
            {
              key: 'ageMs',
              label: 'Age',
              render: (r) => formatAge(Number(r.ageMs)),
            },
            { key: 'matchRound', label: 'Round' },
          ]}
          rows={data.live}
          empty="No active rooms"
        />
      </Section>

      <Section title="Recent matches">
        <DataTable
          columns={[
            { key: 'roomCode', label: 'Code' },
            { key: 'phase', label: 'Phase' },
            { key: 'buyin', label: 'Buy-in' },
            {
              key: 'result',
              label: 'Winner',
              render: (r) => {
                const result = r.result as { winnerName?: string; p1Score?: number; p2Score?: number } | undefined;
                if (!result?.winnerName) return '—';
                return `${result.winnerName} (${result.p1Score ?? 0}-${result.p2Score ?? 0})`;
              },
            },
            {
              key: 'replay',
              label: 'Replay',
              render: (r) => {
                const replay = r.replay as { available?: boolean } | undefined;
                return replay?.available ? 'yes' : 'no';
              },
            },
            {
              key: 'finishedAt',
              label: 'Finished',
              render: (r) =>
                r.finishedAt
                  ? new Date(Number(r.finishedAt)).toLocaleString()
                  : '—',
            },
          ]}
          rows={data.history}
          empty="No match history"
        />
      </Section>
    </div>
  );
}
