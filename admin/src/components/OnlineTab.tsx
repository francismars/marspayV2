import type { OnlineData, OnlineRoomLive, ReplayData } from '../lib/api';
import { formatAge } from '../lib/hooks';
import { DataTable, KpiCard, Section } from './ui';

function SeatCell({ seat }: { seat: OnlineRoomLive['seats'][0] }) {
  if (!seat.sessionID && seat.status === 'open') {
    return <span className="text-slate-500">open</span>;
  }
  return (
    <div className="flex items-center gap-2">
      {seat.picture ? (
        <img src={seat.picture} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : null}
      <div className="min-w-0 text-xs">
        <div className="truncate text-slate-300">{seat.name ?? seat.pubkeyPrefix ?? '—'}</div>
        <div className="text-slate-500">
          {seat.status}
          {seat.payMethod ? ` · ${seat.payMethod}` : ''}
        </div>
      </div>
    </div>
  );
}

export function OnlineTab({
  data,
  replays,
  onSeatClick,
}: {
  data: OnlineData;
  replays?: ReplayData;
  onSeatClick?: (sessionID: string) => void;
}) {
  return (
    <div className="space-y-8">
      <Section title={`Live rooms (${data.live.length})`}>
        <DataTable
          columns={[
            { key: 'roomCode', label: 'Code' },
            { key: 'phase', label: 'Phase' },
            { key: 'buyin', label: 'Buy-in' },
            {
              key: 'p1',
              label: 'P1',
              sortable: false,
              render: (r) => {
                const room = r as unknown as OnlineRoomLive;
                const p1 = room.seats?.find((s) => s.role === 'p1');
                return p1 ? <SeatCell seat={p1} /> : '—';
              },
            },
            {
              key: 'p2',
              label: 'P2',
              sortable: false,
              render: (r) => {
                const room = r as unknown as OnlineRoomLive;
                const p2 = room.seats?.find((s) => s.role === 'p2');
                return p2 ? <SeatCell seat={p2} /> : '—';
              },
            },
            {
              key: 'seatsPaid',
              label: 'Paid',
              render: (r) => `${r.seatsPaid}/${r.seatsTotal}`,
            },
            { key: 'spectators', label: 'Spectators' },
            {
              key: 'ageMs',
              label: 'Age',
              render: (r) => formatAge(Number(r.ageMs)),
            },
            {
              key: 'links',
              label: 'Links',
              sortable: false,
              render: (r) => {
                const room = r as unknown as OnlineRoomLive;
                return (
                  <div className="flex flex-col gap-1 text-xs">
                    <a
                      href={room.lobbyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Lobby
                    </a>
                    {room.gameUrl ? (
                      <a
                        href={room.gameUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Game
                      </a>
                    ) : null}
                  </div>
                );
              },
            },
          ]}
          rows={data.live as unknown as Array<Record<string, unknown>>}
          rowKey={(r) => String(r.roomId)}
          onRowClick={
            onSeatClick
              ? (r) => {
                  const room = r as unknown as OnlineRoomLive;
                  const seat = room.seats?.find((s) => s.sessionID);
                  if (seat?.sessionID) onSeatClick(seat.sessionID);
                }
              : undefined
          }
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
              key: 'lobbyUrl',
              label: 'Lobby',
              sortable: false,
              render: (r) =>
                r.lobbyUrl ? (
                  <a
                    href={String(r.lobbyUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    open
                  </a>
                ) : (
                  '—'
                ),
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
          rowKey={(r) => String(r.roomId ?? r.roomCode)}
          empty="No match history"
        />
      </Section>

      {replays ? (
        <Section title="Replay & spectate">
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Replay starts" value={replays.replayStarts} />
            <KpiCard label="Replay ends" value={replays.replayEnds} />
            <KpiCard label="Spectate starts" value={replays.spectateStarts} />
            <KpiCard
              label="Avg watch time"
              value={
                replays.avgWatchDurationMs > 0
                  ? `${Math.round(replays.avgWatchDurationMs / 1000)}s`
                  : '—'
              }
            />
          </div>
          <DataTable
            columns={[
              { key: 'roomCode', label: 'Room' },
              { key: 'count', label: 'Replay views' },
            ]}
            rows={replays.topRooms}
            rowKey={(r) => String(r.roomCode)}
            empty="No replay views yet"
          />
        </Section>
      ) : null}
    </div>
  );
}
