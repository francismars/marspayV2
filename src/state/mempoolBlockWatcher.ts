import type { Server } from 'socket.io';
import { spawnBlockRewardCoinbase } from '../game/onlineEngine';
import { forEachPlayingOnlineRoom } from './onlineRoomState';
import { pruneOnlineSnapshotForWire } from './onlineSnapshotWire';
import { dateNow } from '../utils/time';

/** Same cadence as chain-duel-react `startMempoolFeed`. */
const MEMPOOL_POLL_MS = 5000;

interface MempoolBlockJson {
  height: number;
  extras?: { medianFee?: number };
}

async function fetchTipBlock(): Promise<MempoolBlockJson | null> {
  try {
    const tipRes = await fetch('https://mempool.space/api/blocks/tip/hash');
    if (!tipRes.ok) {
      return null;
    }
    const tipHash = (await tipRes.text()).trim();
    const blockRes = await fetch(`https://mempool.space/api/v1/block/${tipHash}`);
    if (!blockRes.ok) {
      return null;
    }
    return (await blockRes.json()) as MempoolBlockJson;
  } catch {
    return null;
  }
}

/**
 * Polls mempool.space for a new tip block; on height increase, spawns a bonus (or plain)
 * coinbase in every `playing` online room and pushes a pruned snapshot + effect event.
 */
export function startMempoolBlockWatcher(io: Server): void {
  let latestHeight = -1;

  const tick = async () => {
    try {
      const block = await fetchTipBlock();
      if (!block) {
        return;
      }
      const height = block.height;
      const raw = block.extras?.medianFee;
      const medianFeeSatPerVb =
        typeof raw === 'number' && Number.isFinite(raw) ? raw : -1;

      if (latestHeight === -1) {
        latestHeight = height;
        return;
      }
      if (height <= latestHeight) {
        return;
      }
      latestHeight = height;

      forEachPlayingOnlineRoom((room) => {
        const spawned = spawnBlockRewardCoinbase(room.snapshot.state, medianFeeSatPerVb);
        if (!spawned) {
          return;
        }
        room.replay.blockEvents = room.replay.blockEvents ?? [];
        room.replay.blockEvents.push({
          frameIndex: room.replay.frames.length,
          blockHeight: height,
          medianFeeSatPerVb: medianFeeSatPerVb >= 0 ? Math.round(medianFeeSatPerVb) : -1,
        });
        room.updatedAt = Date.now();
        io.to(room.roomId).emit('onlineRoomSnapshot', {
          roomId: room.roomId,
          snapshot: pruneOnlineSnapshotForWire(room.snapshot),
        });
        io.to(room.roomId).emit('onlineBitcoinBlock', {
          roomId: room.roomId,
          blockHeight: height,
          medianFeeSatPerVb: medianFeeSatPerVb >= 0 ? Math.round(medianFeeSatPerVb) : -1,
        });
      });
    } catch (error) {
      console.error(
        `${dateNow()} [MEMPOOL_BLOCK] tick failed:`,
        error instanceof Error ? error.message : error
      );
    }
  };

  const id = setInterval(() => {
    void tick();
  }, MEMPOOL_POLL_MS);

  void tick();
}
