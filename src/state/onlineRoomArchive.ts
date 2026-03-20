/**
 * Persists ONLINE matches: one file per match (`roomId-rN.json`) when a sim ends,
 * and `roomId-session.json` when the room is deleted after the winner closes payout.
 */
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { PlayerRole } from '../types/game';
import type { OnlineRoomSnapshot } from '../types/online';

const INDEX_FILE = 'index.jsonl';

export type ArchiveKind = 'match' | 'session';

export interface OnlineRoomArchiveFile {
  version: 1;
  kind: ArchiveKind;
  roomId: string;
  /** Present for kind === 'match' */
  matchRound?: number;
  /** Unique key for index rows */
  archiveId: string;
  finishedAt: number;
  serializedRoom: Record<string, unknown>;
  replay: {
    tickMs: number;
    frames: OnlineRoomSnapshot[];
  };
}

export interface OnlineArchivedListItem {
  archiveId?: string;
  roomId: string;
  roomCode: string;
  buyin: number;
  createdAt: number;
  finishedAt: number;
  phase: 'postgame' | 'finished';
  archiveKind: ArchiveKind;
  matchRound?: number;
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

function matchFileName(roomId: string, matchRound: number): string {
  return `${roomId}-r${matchRound}.json`;
}

function sessionFileName(roomId: string): string {
  return `${roomId}-session.json`;
}

/** Legacy single-file archive from older builds. */
function legacyRoomFileName(roomId: string): string {
  return `${roomId}.json`;
}

/** When a match sim ends (postgame): persist replay before DoN may reset buffers. */
export async function appendOnlineMatchArchive(payload: OnlineRoomArchiveFile): Promise<void> {
  if (payload.kind !== 'match' || payload.matchRound == null) {
    console.error('[online_archive] appendOnlineMatchArchive: expected kind=match + matchRound');
    return;
  }
  try {
    await ensureDir();
    const filePath = path.join(archiveDir(), matchFileName(payload.roomId, payload.matchRound));
    await fsPromises.writeFile(filePath, JSON.stringify(payload), 'utf8');

    const sr = payload.serializedRoom as {
      roomCode?: string;
      buyin?: number;
      createdAt?: number;
      replay?: { frameCount?: number; tickMs?: number; durationMs?: number };
      result?: OnlineArchivedListItem['result'];
    };
    const indexLine: OnlineArchivedListItem = {
      archiveId: payload.archiveId,
      roomId: payload.roomId,
      roomCode: sr.roomCode ?? payload.roomId,
      buyin: sr.buyin ?? 0,
      createdAt: sr.createdAt ?? payload.finishedAt,
      finishedAt: payload.finishedAt,
      phase: 'postgame',
      archiveKind: 'match',
      matchRound: payload.matchRound,
      playersPaid: 2,
      seatsTotal: 2,
      spectators: 0,
      archived: true,
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
    console.log(
      `[online_archive] match ${payload.archiveId} (${payload.replay.frames.length} frames)`
    );
  } catch (e) {
    console.error('[online_archive] append match failed', e);
  }
}

/** When room is deleted after winner closed payout (phase finished). */
export async function appendOnlineRoomArchive(payload: {
  version: 1;
  kind: 'session';
  roomId: string;
  archiveId: string;
  finishedAt: number;
  serializedRoom: Record<string, unknown>;
  replay: { tickMs: number; frames: OnlineRoomSnapshot[] };
}): Promise<void> {
  try {
    await ensureDir();
    const filePath = path.join(archiveDir(), sessionFileName(payload.roomId));
    const full: OnlineRoomArchiveFile = {
      version: 1,
      kind: 'session',
      roomId: payload.roomId,
      archiveId: payload.archiveId,
      finishedAt: payload.finishedAt,
      serializedRoom: payload.serializedRoom,
      replay: payload.replay,
    };
    await fsPromises.writeFile(filePath, JSON.stringify(full), 'utf8');

    const sr = payload.serializedRoom as {
      roomCode?: string;
      buyin?: number;
      createdAt?: number;
      replay?: { frameCount?: number; tickMs?: number; durationMs?: number };
      result?: OnlineArchivedListItem['result'];
    };
    const indexLine: OnlineArchivedListItem = {
      archiveId: payload.archiveId,
      roomId: payload.roomId,
      roomCode: sr.roomCode ?? payload.roomId,
      buyin: sr.buyin ?? 0,
      createdAt: sr.createdAt ?? payload.finishedAt,
      finishedAt: payload.finishedAt,
      phase: 'finished',
      archiveKind: 'session',
      playersPaid: 2,
      seatsTotal: 2,
      spectators: 0,
      archived: true,
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
    console.log(`[online_archive] session ${payload.archiveId} (${payload.replay.frames.length} frames)`);
  } catch (e) {
    console.error('[online_archive] append session failed', e);
  }
}

function readArchiveJsonFile(filePath: string): OnlineRoomArchiveFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OnlineRoomArchiveFile;
    if (parsed.version !== 1 || !parsed.replay?.frames) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readArchiveFileAny(filePath: string): OnlineRoomArchiveFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OnlineRoomArchiveFile;
    if (parsed.version !== 1 || !parsed.serializedRoom) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Load replay: live memory preferred; else `roomId-rN` match file; else session/legacy. */
export function loadReplayFromArchiveSync(
  roomId: string,
  matchRound?: number
): { roomId: string; tickMs: number; frames: OnlineRoomSnapshot[]; matchRound?: number } | undefined {
  if (matchRound != null) {
    const m = readArchiveJsonFile(path.join(archiveDir(), matchFileName(roomId, matchRound)));
    if (m?.replay?.frames?.length) {
      return {
        roomId: m.roomId,
        tickMs: m.replay.tickMs,
        frames: m.replay.frames,
        matchRound: m.matchRound,
      };
    }
    return undefined;
  }
  const session = readArchiveJsonFile(path.join(archiveDir(), sessionFileName(roomId)));
  if (session?.replay?.frames?.length) {
    return {
      roomId: session.roomId,
      tickMs: session.replay.tickMs,
      frames: session.replay.frames,
    };
  }
  const legacy = readArchiveJsonFile(path.join(archiveDir(), legacyRoomFileName(roomId)));
  if (legacy?.replay?.frames?.length) {
    return {
      roomId: legacy.roomId,
      tickMs: legacy.replay.tickMs,
      frames: legacy.replay.frames,
    };
  }
  return undefined;
}

function tryLoadSerializedFromFile(filePath: string): Record<string, unknown> | undefined {
  const parsed = readArchiveFileAny(filePath);
  if (!parsed?.serializedRoom) {
    return undefined;
  }
  return parsed.serializedRoom as Record<string, unknown>;
}

export function loadSerializedRoomFromArchiveSync(roomId: string): Record<string, unknown> | undefined {
  const session = tryLoadSerializedFromFile(path.join(archiveDir(), sessionFileName(roomId)));
  if (session) {
    return session;
  }
  const legacy = tryLoadSerializedFromFile(path.join(archiveDir(), legacyRoomFileName(roomId)));
  if (legacy) {
    return legacy;
  }
  return undefined;
}

const MAX_LIST = 400;

export function listArchivedOnlineRoomsSync(): OnlineArchivedListItem[] {
  const indexPath = path.join(archiveDir(), INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const byKey = new Map<string, OnlineArchivedListItem>();
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as OnlineArchivedListItem & { archiveId?: string };
        if (!row.roomId || !row.archived) {
          continue;
        }
        const key =
          row.archiveId ??
          `${row.roomId}-${row.archiveKind ?? 'legacy'}-${row.matchRound ?? ''}-${row.finishedAt}`;
        const prev = byKey.get(key);
        if (!prev || row.finishedAt >= prev.finishedAt) {
          byKey.set(key, {
            ...row,
            archiveId: row.archiveId ?? key,
            archiveKind: row.archiveKind ?? (row.matchRound != null ? 'match' : 'session'),
            phase: row.phase ?? 'finished',
          });
        }
      } catch {
        /* skip */
      }
    }
    const items = [...byKey.values()];
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

export function getOnlinePostGameFromArchive(roomId: string) {
  const sessionPath = path.join(archiveDir(), sessionFileName(roomId));
  const legacyPath = path.join(archiveDir(), legacyRoomFileName(roomId));
  const raw = fs.existsSync(sessionPath)
    ? fs.readFileSync(sessionPath, 'utf8')
    : fs.existsSync(legacyPath)
      ? fs.readFileSync(legacyPath, 'utf8')
      : null;
  if (!raw) {
    return undefined;
  }
  try {
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
