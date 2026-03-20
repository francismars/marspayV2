import type { OnlineRoomSnapshot } from '../types/online';

/** Max floating point-change popups sent per tick (server keeps full list internally). */
const MAX_POINT_CHANGES_WIRE = 24;

/**
 * Smaller payload for `onlineRoomSnapshot` (field pruning + cap pointChanges).
 * Client merges with `hud` / defaults via `normalizeOnlineRoomSnapshot`.
 */
export function pruneOnlineSnapshotForWire(snapshot: OnlineRoomSnapshot): OnlineRoomSnapshot {
  const state = snapshot.state;
  const pc = state.pointChanges;
  const prunedPc =
    Array.isArray(pc) && pc.length > MAX_POINT_CHANGES_WIRE
      ? pc.slice(pc.length - MAX_POINT_CHANGES_WIRE)
      : pc;

  return {
    tick: snapshot.tick,
    phase: snapshot.phase,
    hud: snapshot.hud,
    state: {
      cols: state.cols,
      rows: state.rows,
      p1: state.p1,
      p2: state.p2,
      coinbases: state.coinbases,
      gameStarted: state.gameStarted,
      gameEnded: state.gameEnded,
      countdownStart: state.countdownStart,
      countdownTicks: state.countdownTicks,
      winnerPlayer: state.winnerPlayer,
      winnerName: state.winnerName,
      sentWinner: state.sentWinner,
      initialScore: state.initialScore,
      score: state.score,
      totalPoints: state.totalPoints,
      pointChanges: prunedPc as typeof state.pointChanges,
      p1Name: state.p1Name,
      p2Name: state.p2Name,
      meta: { modeLabel: state.meta.modeLabel },
    } as OnlineRoomSnapshot['state'],
  };
}
