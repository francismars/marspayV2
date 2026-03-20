/**
 * Persists finished ONLINE rooms to disk so replays and post-game info survive
 * process restarts and cleanup (rooms are deleted from memory ~2 min after settle).
 */
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { PlayerRole } from '../types/game';
import type { OnlineRoomSnapshot } from '../types/online';

const INDEX_FILE = 'index.jsonl';

export interface OnlineRoomArchiveFile {
  version: 1;
  roomId: string;
  finishedAt: number;
  /** Same shape as serializeRoom() from onlineRoomState */
  serializedRoom: Record<string, unknown>;
  replay: {
    tickMs: number;
    frames: OnlineRoomSnapshot[];
  };
}

export interface OnlineArchivedListItem {
  roomId: string;
  roomCode: string;
  buyin: number;
  createdAt: number;
  finishedAt: number;
  phase: 'finished';
  playersPaid: number;
  seatsTotal: number;
  spectators: number;
  archived: true;
  replay?: {
    available: boolean;
    frameCount: number;
    tickMs: number;
    durationMs: number;
  };
  result?: {
    winnerName: string;
    p1Name: string;
    p2Name: string;
    p1Score: number;
    p2Score: number;
    netPrize: number;
  };
}

function archiveDir(): string {
  return path.join(process.cwd(), 'data', 'online_archive');
}

async function ensureDir(): Promise<void> {
  await fsPromises.mkdir(archiveDir(), { recursive: true });
}

export async function appendOnlineRoomArchive(
  payload: OnlineRoomArchiveFile
): Promise<void> {
  try {
    await ensureDir();
    const filePath = path.join(archiveDir(), `${payload.roomId}.json`);
    await fsPromises.writeFile(filePath, JSON.stringify(payload), 'utf8');

    const sr = payload.serializedRoom as {
      roomCode?: string;
      buyin?: number;
      createdAt?: number;
      replay?: { frameCount?: number; tickMs?: number; durationMs?: number };
      result?: OnlineArchivedListItem['result'];
    };
    const indexLine = {
      roomId: payload.roomId,
      roomCode: sr.roomCode ?? payload.roomId,
      buyin: sr.buyin ?? 0,
      createdAt: sr.createdAt ?? payload.finishedAt,
      finishedAt: payload.finishedAt,
      phase: 'finished' as const,
      playersPaid: 2,
      seatsTotal: 2,
      spectators: 0,
      archived: true as const,
      replay: sr.replay
        ? {
            available: (sr.replay.frameCount ?? 0) > 0,
            frameCount: sr.replay.frameCount ?? payload.replay.frames.length,
            tickMs: sr.replay.tickMs ?? payload.replay.tickMs,
            durationMs:
              sr.replay.durationMs ??
              payload.replay.frames.length * payload.replay.tickMs,
          }
        : undefined,
      result: sr.result,
    };
    const indexPath = path.join(archiveDir(), INDEX_FILE);
    await fsPromises.appendFile(indexPath, JSON.stringify(indexLine) + '\n', 'utf8');
    console.log(`[online_archive] wrote ${payload.roomId} (${payload.replay.frames.length} frames)`);
  } catch (e) {
    console.error('[online_archive] append failed', e);
  }
}

/** Sync read for socket handlers (small set of files). */
export function loadReplayFromArchiveSync(roomId: string):
  | { roomId: string; tickMs: number; frames: OnlineRoomSnapshot[] }
  | undefined {
  const filePath = path.join(archiveDir(), `${roomId}.json`);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OnlineRoomArchiveFile;
    if (!parsed.replay?.frames?.length) {
      return undefined;
    }
    return {
      roomId: parsed.roomId,
      tickMs: parsed.replay.tickMs,
      frames: parsed.replay.frames,
    };
  } catch {
    return undefined;
  }
}

export function loadSerializedRoomFromArchiveSync(
  roomId: string
): Record<string, unknown> | undefined {
  const filePath = path.join(archiveDir(), `${roomId}.json`);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OnlineRoomArchiveFile;
    if (parsed.version !== 1 || !parsed.serializedRoom) {
      return undefined;
    }
    return parsed.serializedRoom as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const MAX_LIST = 200;

export function listArchivedOnlineRoomsSync(): OnlineArchivedListItem[] {
  const indexPath = path.join(archiveDir(), INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const byId = new Map<string, OnlineArchivedListItem>();
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as OnlineArchivedListItem;
        if (!row.roomId || !row.archived) {
          continue;
        }
        const prev = byId.get(row.roomId);
        if (!prev || row.finishedAt >= prev.finishedAt) {
          byId.set(row.roomId, row);
        }
      } catch {
        /* skip */
      }
    }
    const items = [...byId.values()];
    items.sort((a, b) => b.finishedAt - a.finishedAt);
    return items.slice(0, MAX_LIST);
  } catch {
    return [];
  }
}

type ArchivedSeat = {
  name?: string;
  picture?: string;
  sessionID?: string;
  lnAddress?: string;
};

/** Same payload as getOnlinePostGame() in onlineRoomState, but built from disk. */
export function getOnlinePostGameFromArchive(roomId: string) {
  const filePath = path.join(archiveDir(), `${roomId}.json`);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OnlineRoomArchiveFile;
    if (parsed.version !== 1 || !parsed.serializedRoom) {
      return undefined;
    }
    const sr = parsed.serializedRoom as {
      roomId: string;
      phase?: string;
      seats?: Record<string, ArchivedSeat>;
      snapshot?: { state?: { score?: number[] } };
      postGame?: {
        p1Picture?: string;
        p2Picture?: string;
        winnerRole?: PlayerRole.Player1 | PlayerRole.Player2;
        winnerSessionID?: string;
        winnerName: string;
        winnerPicture?: string;
        winnerPoints: number;
        totalPrize: number;
        lnurlw?: string;
        payoutMethod?: 'withdraw_qr' | 'nostr_zap';
        payoutTarget?: string;
        rematchRequested?: boolean;
        rematchRequiredAmount?: number;
        rematchEventId?: string;
        rematchNote1?: string;
        rematchWaitingForSessionID?: string;
        doubleOrNothingVotes?: number;
      };
    };
    if (sr.phase !== 'finished' || !sr.postGame) {
      return undefined;
    }
    const seats = sr.seats ?? {};
    const p1 = seats[PlayerRole.Player1];
    const p2 = seats[PlayerRole.Player2];
    const score = sr.snapshot?.state?.score ?? [0, 0];
    const pg = sr.postGame;
    return {
      roomId: sr.roomId,
      phase: 'finished' as const,
      p1Name: p1?.name ?? 'Player 1',
      p2Name: p2?.name ?? 'Player 2',
      p1Picture: p1?.picture ?? pg.p1Picture,
      p2Picture: p2?.picture ?? pg.p2Picture,
      p1SessionID: p1?.sessionID,
      p2SessionID: p2?.sessionID,
      p1Points: score[0] ?? 0,
      p2Points: score[1] ?? 0,
      winnerRole: pg.winnerRole,
      winnerSessionID: pg.winnerSessionID,
      winnerName: pg.winnerName,
      winnerPicture: pg.winnerPicture,
      winnerPoints: pg.winnerPoints,
      totalPrize: pg.totalPrize,
      lnurlw: pg.lnurlw,
      payoutMethod: pg.payoutMethod,
      payoutTarget: pg.payoutTarget,
      rematchRequested: pg.rematchRequested,
      rematchRequiredAmount: pg.rematchRequiredAmount,
      rematchEventId: pg.rematchEventId,
      rematchNote1: pg.rematchNote1,
      rematchWaitingForSessionID: pg.rematchWaitingForSessionID,
      winnerLnAddress:
        pg.winnerRole != null ? seats[pg.winnerRole]?.lnAddress : undefined,
      doubleOrNothingVotes: pg.doubleOrNothingVotes ?? 0,
    };
  } catch {
    return undefined;
  }
}
