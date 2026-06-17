import type { Server } from 'socket.io';
import { spawnBlockRewardCoinbase } from '../game/onlineEngine';
import { dateNow } from '../utils/time';
import {
  fetchLatestMempoolTipBlock,
  MEMPOOL_API_HOSTS,
  resolveMempoolApiHosts,
} from './mempoolApi';
import { forEachPlayingOnlineRoom } from './onlineRoomState';
import { pruneOnlineSnapshotForWire } from './onlineSnapshotWire';

/** Same cadence as chain-duel-react `startMempoolFeed`. */
const MEMPOOL_POLL_MS = 5000;
/** Log repeated poll failures at most once per minute. */
const POLL_FAILURE_LOG_EVERY = 12;

/**
 * Polls mempool mirrors for a new tip block; on height increase, spawns a bonus (or plain)
 * coinbase in every `playing` online room and pushes a pruned snapshot + effect event.
 */
export function startMempoolBlockWatcher(io: Server): void {
  let latestHeight = -1;
  let activeHost: string | null = null;
  let consecutivePollFailures = 0;
  const hosts = resolveMempoolApiHosts();

  const tick = async () => {
    try {
      const result = await fetchLatestMempoolTipBlock(hosts);
      if (!result) {
        consecutivePollFailures += 1;
        if (
          consecutivePollFailures === 1 ||
          consecutivePollFailures % POLL_FAILURE_LOG_EVERY === 0
        ) {
          console.warn(
            `${dateNow()} [MEMPOOL_BLOCK] all hosts unreachable (${hosts.join(', ')})`
          );
        }
        return;
      }

      if (consecutivePollFailures > 0) {
        consecutivePollFailures = 0;
      }

      if (activeHost !== result.host) {
        const mirror = result.host !== MEMPOOL_API_HOSTS[0];
        console.log(
          `${dateNow()} [MEMPOOL_BLOCK] using ${mirror ? 'mirror ' : ''}${result.host}`
        );
        activeHost = result.host;
      }

      const block = result.block;
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

  setInterval(() => {
    void tick();
  }, MEMPOOL_POLL_MS);

  void tick();
}
