/**
 * Compact replay: gzip’d JSON (header + thin frames). Legacy full-frame JSON is not supported.
 * Wire + disk use the same `PackedReplay` shape; clients gunzip + decode via `onlineReplayCodec`.
 */
import { gzipSync } from 'zlib';
import type { OnlineRoomSnapshot } from '../types/online';
import {
  COMPACT_REPLAY_FORMAT,
  encodeFramesToInnerJson,
} from './onlineReplayCodec';

export { COMPACT_REPLAY_FORMAT } from './onlineReplayCodec';

export type PackedReplay = {
  format: typeof COMPACT_REPLAY_FORMAT;
  tickMs: number;
  gzipBase64: string;
  frameCount: number;
};

/** Payload sent over Socket.IO and stored under `replay` in archive files. */
export type OnlineReplayWirePayload = PackedReplay & {
  roomId: string;
  matchRound?: number;
};

/** Persist: compact + gzip. Empty frames → zero-length payload. */
export function packReplayForArchive(
  frames: OnlineRoomSnapshot[],
  tickMs: number
): PackedReplay {
  if (frames.length === 0) {
    return { format: COMPACT_REPLAY_FORMAT, tickMs, gzipBase64: '', frameCount: 0 };
  }
  const inner = encodeFramesToInnerJson(frames);
  const json = JSON.stringify(inner);
  const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  return {
    format: COMPACT_REPLAY_FORMAT,
    tickMs,
    gzipBase64: gz.toString('base64'),
    frameCount: frames.length,
  };
}

export function replayFrameCount(replay: PackedReplay): number {
  return replay.frameCount;
}
