import { randomBytes } from 'node:crypto';
import { BUYINMIN } from '../consts/values';
import { PlayerRole } from '../types/game';
import { dateNow } from '../utils/time';
import {
  JoinPinRecord,
  OnlineRoom,
  OnlineRoomListItem,
  OnlineRoomMember,
  OnlineRoomNostrMeta,
  OnlineSeatState,
} from '../types/online';
import {
  createOnlineGameState,
  getOnlineHudState,
  setOnlineWantedDirection,
  startOnlineCountdown,
  stepOnlineGame,
} from '../game/onlineEngine';
import {
  appendOnlineMatchArchive,
  appendOnlineRoomArchive,
  archivedRowToOnlineRoomListItem,
  getOnlinePostGameFromArchive,
  listArchivedOnlineRoomsSync,
  loadCompactReplayFromArchiveSync,
} from './onlineRoomArchive';
import { packReplayForArchive, type OnlineReplayWirePayload } from './onlineReplayCompact';

const PIN_TTL_MS = 2 * 60 * 1000;
/** Home / NIP-07 path: pubkey linked to session before zap (no PIN in comment). */
const NOSTR_LINK_TTL_MS = 15 * 60 * 1000;
const NOSTR_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ROOM_IDLE_TTL_MS = 20 * 60 * 1000;
const ROOM_CLEANUP_MS = 15 * 1000;
const SEAT_DISCONNECT_TTL_MS = 15 * 60 * 1000;
/** Fallback delete if immediate removal after payout failed (should be rare). */
const SETTLED_ROOM_DELETE_FALLBACK_MS = 30 * 1000;
const ONLINE_PAYOUT_MULTIPLIER = 0.95;
const ONLINE_REPLAY_TICK_MS = 100;
const ONLINE_REPLAY_MAX_FRAMES = 3_600;

const roomById = new Map<string, OnlineRoom>();
const roomIdByCode = new Map<string, string>();
const roomIdBySession = new Map<string, string>();
const roomIdByKind1EventId = new Map<string, string>();
const pinByValue = new Map<string, JoinPinRecord>();

type PendingNostrChallenge = { roomId: string; challenge: string; expiresAt: number };
const pendingNostrChallengeBySession = new Map<string, PendingNostrChallenge>();

export type OnlineNostrLinkRecord = {
  roomId: string;
  sessionID: string;
  socketID: string;
  pubkey: string;
  expiresAt: number;
};

const nostrLinkByRoomPubkey = new Map<string, OnlineNostrLinkRecord>();

function nostrLinkKey(roomId: string, pubkey: string) {
  return `${roomId}:${pubkey.toLowerCase()}`;
}

function logOnlineState(message: string) {
  console.log(`${dateNow()} [ONLINE_STATE] ${message}`);
}

function randomToken(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function randomNumericPin(length: number): string {
  const digits = '0123456789';
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += digits[Math.floor(Math.random() * digits.length)];
  }
  return value;
}

function uniqueCode(): string {
  let code = randomToken(6);
  while (roomIdByCode.has(code)) {
    code = randomToken(6);
  }
  return code;
}

function uniqueRoomId(): string {
  return `${Date.now().toString(36)}-${randomToken(6)}`;
}

export function getRoomById(roomId: string) {
  return roomById.get(roomId);
}

/** Iterate live rooms in `playing` phase (for mempool block rewards, etc.). */
export function forEachPlayingOnlineRoom(fn: (room: OnlineRoom) => void): void {
  for (const room of roomById.values()) {
    if (room.phase === 'playing') {
      fn(room);
    }
  }
}

export function getRoomByCode(roomCode: string) {
  const roomId = roomIdByCode.get(roomCode.toUpperCase());
  if (!roomId) {
    return;
  }
  return roomById.get(roomId);
}

export function getRoomBySession(sessionID: string) {
  const roomId = roomIdBySession.get(sessionID);
  if (!roomId) {
    return;
  }
  return roomById.get(roomId);
}

export function getRoomByKind1EventId(kind1EventId: string) {
  const roomId = roomIdByKind1EventId.get(kind1EventId);
  if (!roomId) {
    return;
  }
  return roomById.get(roomId);
}

export function createOnlineRoom(params: {
  hostSessionID: string;
  hostSocketID: string;
  buyin?: number;
}): OnlineRoom {
  const roomId = uniqueRoomId();
  const roomCode = uniqueCode();
  const parsedBuyin = Math.floor(params.buyin ?? BUYINMIN);
  const buyin =
    Number.isFinite(parsedBuyin) && parsedBuyin > 0 ? parsedBuyin : BUYINMIN;

  const p1: OnlineSeatState = { role: PlayerRole.Player1, status: 'open' };
  const p2: OnlineSeatState = { role: PlayerRole.Player2, status: 'open' };
  const now = Date.now();
  const room: OnlineRoom = {
    roomId,
    roomCode,
    hostSessionID: params.hostSessionID,
    hostSocketID: params.hostSocketID,
    createdAt: now,
    updatedAt: now,
    buyin,
    matchRound: 0,
    phase: 'lobby',
    members: new Map<string, OnlineRoomMember>(),
    spectators: new Set<string>(),
    seats: new Map([
      [PlayerRole.Player1, p1],
      [PlayerRole.Player2, p2],
    ]),
    inputBySession: new Map(),
    snapshot: {
      tick: 0,
      phase: 'lobby',
      state: createOnlineGameState({
        p1Name: 'Player 1',
        p2Name: 'Player 2',
        p1Points: buyin,
        p2Points: buyin,
      }),
      hud: {
        p1Points: buyin,
        p2Points: buyin,
        captureP1: '2%',
        captureP2: '2%',
        initialWidthP1: 50,
        initialWidthP2: 50,
        currentWidthP1: 50,
        currentWidthP2: 50,
      },
    },
    replay: {
      tickMs: ONLINE_REPLAY_TICK_MS,
      frames: [],
    },
    postGame: {
      p1Picture: undefined,
      p2Picture: undefined,
      winnerName: '',
      winnerPoints: 0,
      totalPrize: 0,
      doubleOrNothingVotes: new Set<string>(),
      rematchRequested: false,
    },
  };
  room.members.set(params.hostSessionID, {
    sessionID: params.hostSessionID,
    socketID: params.hostSocketID,
    joinedAt: now,
    lastSeen: now,
  });
  room.spectators.add(params.hostSessionID);

  roomById.set(roomId, room);
  roomIdByCode.set(roomCode, roomId);
  roomIdBySession.set(params.hostSessionID, roomId);
  logOnlineState(
    `created roomId=${roomId} code=${roomCode} host=${params.hostSessionID} buyin=${buyin}`
  );
  return room;
}

function winnerPointsFromSnapshot(room: OnlineRoom): number {
  const s = room.snapshot.state;
  const p1 = s.score?.[0] ?? 0;
  const p2 = s.score?.[1] ?? 0;
  const winningRole = s.winnerPlayer === 'P2' ? PlayerRole.Player2 : PlayerRole.Player1;
  return winningRole === PlayerRole.Player1 ? p1 : p2;
}

function roomToFinishedResult(room: OnlineRoom): NonNullable<OnlineRoomListItem['result']> {
  const p1Seat = room.seats.get(PlayerRole.Player1);
  const p2Seat = room.seats.get(PlayerRole.Player2);
  return {
    winnerName:
      room.postGame.winnerName ||
      room.snapshot.state.winnerName ||
      room.snapshot.state.p1Name ||
      'Winner',
    p1Name: p1Seat?.name ?? room.snapshot.state.p1Name ?? 'Player 1',
    p2Name: p2Seat?.name ?? room.snapshot.state.p2Name ?? 'Player 2',
    p1Score: room.snapshot.state.score?.[0] ?? 0,
    p2Score: room.snapshot.state.score?.[1] ?? 0,
    netPrize: Math.max(
      0,
      Math.floor(winnerPointsFromSnapshot(room) * ONLINE_PAYOUT_MULTIPLIER)
    ),
    p1Picture: p1Seat?.picture ?? room.postGame.p1Picture,
    p2Picture: p2Seat?.picture ?? room.postGame.p2Picture,
    winnerPicture: room.postGame.winnerPicture,
    winnerRole: room.postGame.winnerRole,
  };
}

/**
 * When multiple archive index rows share a `roomId` (per-round match + session), pick the row
 * that represents the final session (payout) or the latest match round — not the first round.
 */
function pickBetterHistoryForRoom(prev: OnlineRoomListItem, next: OnlineRoomListItem): OnlineRoomListItem {
  const prevSession = prev.archiveKind === 'session' ? 1 : 0;
  const nextSession = next.archiveKind === 'session' ? 1 : 0;
  if (prevSession !== nextSession) {
    return prevSession > nextSession ? prev : next;
  }
  const pr = prev.matchRound ?? 0;
  const nr = next.matchRound ?? 0;
  if (pr !== nr) {
    return nr > pr ? next : prev;
  }
  const pt = prev.finishedAt ?? prev.createdAt;
  const nt = next.finishedAt ?? next.createdAt;
  return nt >= pt ? next : prev;
}

/**
 * Single source of truth for History: archived index rows + finished rooms still in RAM
 * (archived wins when both exist for the same `roomId`).
 */
export function listOnlineHistoryMerged(): OnlineRoomListItem[] {
  const archived = listArchivedOnlineRoomsSync().map(archivedRowToOnlineRoomListItem);
  const liveFinished = listOnlineRooms().filter((r) => r.phase === 'finished');
  const byId = new Map<string, OnlineRoomListItem>();
  for (const a of archived) {
    const row = { ...a, archived: true as const };
    const prev = byId.get(a.roomId);
    byId.set(a.roomId, prev ? pickBetterHistoryForRoom(prev, row) : row);
  }
  for (const f of liveFinished) {
    if (!byId.has(f.roomId)) {
      byId.set(f.roomId, { ...f, archived: false });
    }
  }
  return [...byId.values()].sort(
    (a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt)
  );
}

export function listOnlineRooms(): OnlineRoomListItem[] {
  return [...roomById.values()].map((room) => ({
    roomId: room.roomId,
    roomCode: room.roomCode,
    buyin: room.buyin,
    createdAt: room.createdAt,
    finishedAt:
      room.phase === 'finished'
        ? room.postGame.settledAt ?? room.updatedAt
        : undefined,
    phase: room.phase,
    playersPaid: [...room.seats.values()].filter((seat) => seat.status === 'paid').length,
    seatsTotal: 2,
    spectators: room.spectators.size,
    result:
      room.phase === 'postgame' || room.phase === 'finished'
        ? roomToFinishedResult(room)
        : undefined,
    replay:
      room.phase === 'postgame' || room.phase === 'finished'
        ? {
            available: room.replay.frames.length > 0,
            frameCount: room.replay.frames.length,
            tickMs: room.replay.tickMs,
            durationMs: room.replay.frames.length * room.replay.tickMs,
          }
        : undefined,
  }));
}

export function joinRoom(roomId: string, sessionID: string, socketID: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  const now = Date.now();
  room.members.set(sessionID, {
    sessionID,
    socketID,
    joinedAt: now,
    lastSeen: now,
  });
  room.spectators.add(sessionID);
  for (const [role, seat] of room.seats.entries()) {
    if (seat.sessionID === sessionID) {
      room.seats.set(role, { ...seat, socketID, disconnectedAt: undefined });
      room.spectators.delete(sessionID);
    }
  }
  room.updatedAt = now;
  roomIdBySession.set(sessionID, roomId);
  refreshNostrLinkSocket(roomId, sessionID, socketID);
  logOnlineState(`join roomId=${roomId} session=${sessionID} socket=${socketID}`);
  return room;
}

export function touchMember(roomId: string, sessionID: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  const member = room.members.get(sessionID);
  if (member) {
    member.lastSeen = Date.now();
  }
}

export function leaveRoom(sessionID: string, options?: { releaseSeat?: boolean }) {
  const releaseSeat = options?.releaseSeat ?? false;
  const roomId = roomIdBySession.get(sessionID);
  if (!roomId) {
    return;
  }
  const room = roomById.get(roomId);
  if (!room) {
    roomIdBySession.delete(sessionID);
    return;
  }
  let hasPaidSeat = false;
  for (const seat of room.seats.values()) {
    if (seat.sessionID === sessionID && seat.status === 'paid') {
      hasPaidSeat = true;
      break;
    }
  }
  // Keep mapping for paid seats during transient disconnects so reconnect can restore socket cleanly.
  if (releaseSeat || !hasPaidSeat) {
    roomIdBySession.delete(sessionID);
  }
  room.members.delete(sessionID);
  room.spectators.delete(sessionID);
  room.inputBySession.delete(sessionID);
  for (const [role, seat] of room.seats.entries()) {
    if (seat.sessionID === sessionID) {
      if (releaseSeat || seat.status !== 'paid') {
        room.seats.set(role, { role, status: 'open' });
      } else {
        room.seats.set(role, { ...seat, disconnectedAt: Date.now(), ready: false });
      }
    }
  }
  room.updatedAt = Date.now();
  clearNostrSessionStateOnLeave(sessionID, roomId, { releaseSeat, hasPaidSeat });
  logOnlineState(
    `leave roomId=${roomId} session=${sessionID} releaseSeat=${releaseSeat} hadPaidSeat=${hasPaidSeat}`
  );
  if (sessionID === room.hostSessionID) {
    logOnlineState(`host disconnected roomId=${room.roomId}; preserving room for reconnect`);
  }
}

export function deleteRoom(roomId: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.phase === 'finished') {
    void appendOnlineRoomArchive({
      version: 1,
      kind: 'session',
      roomId: room.roomId,
      archiveId: `${room.roomId}-session`,
      finishedAt: room.postGame.settledAt ?? Date.now(),
      serializedRoom: serializeRoom(room) as Record<string, unknown>,
      replay: packReplayForArchive(room.replay.frames, room.replay.tickMs, room.replay.blockEvents),
    });
  }
  for (const sessionID of room.members.keys()) {
    roomIdBySession.delete(sessionID);
  }
  for (const seat of room.seats.values()) {
    if (seat.sessionID) {
      roomIdBySession.delete(seat.sessionID);
    }
  }
  roomById.delete(roomId);
  roomIdByCode.delete(room.roomCode);
  for (const [pin, record] of pinByValue.entries()) {
    if (record.roomId === roomId) {
      pinByValue.delete(pin);
    }
  }
  for (const key of [...nostrLinkByRoomPubkey.keys()]) {
    const rec = nostrLinkByRoomPubkey.get(key);
    if (rec?.roomId === roomId) {
      nostrLinkByRoomPubkey.delete(key);
    }
  }
  for (const sid of [...pendingNostrChallengeBySession.keys()]) {
    const p = pendingNostrChallengeBySession.get(sid);
    if (p?.roomId === roomId) {
      pendingNostrChallengeBySession.delete(sid);
    }
  }
  for (const [eventId, mappedRoomId] of roomIdByKind1EventId.entries()) {
    if (mappedRoomId === roomId) {
      roomIdByKind1EventId.delete(eventId);
    }
  }
  logOnlineState(`deleted roomId=${roomId} code=${room.roomCode}`);
}

export function deleteRoomBySession(sessionID: string) {
  const roomId = roomIdBySession.get(sessionID);
  if (!roomId) {
    return;
  }
  deleteRoom(roomId);
}

export function setRoomNostrMeta(roomId: string, nostrMeta: OnlineRoomNostrMeta, kind1EventId: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.kind1EventId && room.kind1EventId !== kind1EventId) {
    roomIdByKind1EventId.delete(room.kind1EventId);
  }
  room.nostrMeta = nostrMeta;
  room.kind1EventId = kind1EventId;
  roomIdByKind1EventId.set(kind1EventId, roomId);
  room.updatedAt = Date.now();
  logOnlineState(`set nostr meta roomId=${roomId} note=${nostrMeta.note1} emojis=${nostrMeta.emojis}`);
}

export function issueJoinPin(roomId: string, sessionID: string, socketID: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.phase === 'finished') {
    logOnlineState(`pin denied roomId=${roomId} session=${sessionID} reason=room_finished`);
    return;
  }
  if (room.phase === 'postgame' && !room.postGame.rematchRequested) {
    logOnlineState(`pin denied roomId=${roomId} session=${sessionID} reason=round_postgame`);
    return;
  }
  if (room.postGame.rematchRequested) {
    const isSeatedPlayer = [...room.seats.values()].some(
      (seat) => seat.status === 'paid' && seat.sessionID === sessionID
    );
    if (!isSeatedPlayer) {
      logOnlineState(`pin denied roomId=${roomId} session=${sessionID} reason=rematch_locked`);
      return;
    }
  }
  const now = Date.now();
  for (const record of pinByValue.values()) {
    if (record.roomId !== roomId || record.sessionID !== sessionID) {
      continue;
    }
    if (record.used) {
      continue;
    }
    const stillValid = record.expiresAt > now || shouldPinStayActive(record);
    if (!stillValid) {
      continue;
    }
    record.socketID = socketID;
    if (shouldPinStayActive(record)) {
      record.expiresAt = now + PIN_TTL_MS;
    }
    pinByValue.set(pinRecordKey(roomId, record.pin), record);
    logOnlineState(
      `reused pin roomId=${roomId} session=${sessionID} socket=${socketID} expiresAt=${record.expiresAt}`
    );
    return record;
  }
  let pin = randomNumericPin(4);
  while (pinByValue.has(pinRecordKey(roomId, pin))) {
    pin = randomNumericPin(4);
  }
  const record: JoinPinRecord = {
    pin,
    roomId,
    sessionID,
    socketID,
    expiresAt: now + PIN_TTL_MS,
    used: false,
  };
  pinByValue.set(pinRecordKey(roomId, pin), record);
  logOnlineState(
    `issued pin roomId=${roomId} session=${sessionID} socket=${socketID} expiresAt=${record.expiresAt}`
  );
  return record;
}

function canIssueNostrLinkChallenge(roomId: string, sessionID: string): boolean {
  const room = roomById.get(roomId);
  if (!room) {
    return false;
  }
  if (room.phase === 'finished') {
    return false;
  }
  if (room.phase === 'postgame' && !room.postGame.rematchRequested) {
    return false;
  }
  if (room.postGame.rematchRequested) {
    const isSeatedPlayer = [...room.seats.values()].some(
      (seat) => seat.status === 'paid' && seat.sessionID === sessionID
    );
    if (!isSeatedPlayer) {
      return false;
    }
  }
  return true;
}

export function issueNostrLinkChallenge(
  sessionID: string,
  roomId: string
): { challenge: string; expiresAt: number } | undefined {
  if (!canIssueNostrLinkChallenge(roomId, sessionID)) {
    logOnlineState(`nostr challenge denied roomId=${roomId} session=${sessionID}`);
    return undefined;
  }
  const challenge = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + NOSTR_CHALLENGE_TTL_MS;
  pendingNostrChallengeBySession.set(sessionID, { roomId, challenge, expiresAt });
  logOnlineState(`issued nostr challenge roomId=${roomId} session=${sessionID} expiresAt=${expiresAt}`);
  return { challenge, expiresAt };
}

export function peekPendingNostrChallenge(
  sessionID: string,
  roomId: string
): { challenge: string } | undefined {
  const p = pendingNostrChallengeBySession.get(sessionID);
  if (!p || p.roomId !== roomId || p.expiresAt <= Date.now()) {
    return undefined;
  }
  return { challenge: p.challenge };
}

export function clearPendingNostrChallenge(sessionID: string) {
  pendingNostrChallengeBySession.delete(sessionID);
}

export function registerNostrLink(
  roomId: string,
  sessionID: string,
  socketID: string,
  pubkeyHex: string
): { ok: true; expiresAt: number } | { ok: false; reason: string } {
  const room = roomById.get(roomId);
  if (!room) {
    return { ok: false, reason: 'room_not_found' };
  }
  if (!canIssueNostrLinkChallenge(roomId, sessionID)) {
    return { ok: false, reason: 'nostr_link_not_allowed' };
  }
  const pk = pubkeyHex.toLowerCase();
  const key = nostrLinkKey(roomId, pk);
  const existing = nostrLinkByRoomPubkey.get(key);
  if (existing && existing.sessionID !== sessionID && existing.expiresAt > Date.now()) {
    return { ok: false, reason: 'pubkey_already_linked' };
  }
  for (const seat of room.seats.values()) {
    if (
      seat.pubkey &&
      seat.pubkey.toLowerCase() === pk &&
      seat.status === 'paid' &&
      seat.sessionID !== sessionID
    ) {
      return { ok: false, reason: 'pubkey_already_seated' };
    }
  }
  const expiresAt = Date.now() + NOSTR_LINK_TTL_MS;
  nostrLinkByRoomPubkey.set(key, {
    roomId,
    sessionID,
    socketID,
    pubkey: pk,
    expiresAt,
  });
  logOnlineState(`registered nostr link roomId=${roomId} session=${sessionID} pubkey=${pk.slice(0, 8)}…`);
  return { ok: true, expiresAt };
}

export function consumeNostrLinkForZap(
  roomId: string,
  pubkeyHex: string
): { ok: true; record: { sessionID: string; socketID: string } } | { ok: false; reason: string } {
  const pk = pubkeyHex.toLowerCase();
  const key = nostrLinkKey(roomId, pk);
  const rec = nostrLinkByRoomPubkey.get(key);
  if (!rec || rec.roomId !== roomId) {
    return { ok: false, reason: 'nostr_link_not_found' };
  }
  if (rec.expiresAt <= Date.now()) {
    nostrLinkByRoomPubkey.delete(key);
    return { ok: false, reason: 'nostr_link_expired' };
  }
  const sessionID = rec.sessionID;
  const sid = rec.socketID;
  nostrLinkByRoomPubkey.delete(key);
  logOnlineState(`consumed nostr link roomId=${roomId} session=${sessionID}`);
  return { ok: true, record: { sessionID, socketID: sid } };
}

export function refreshNostrLinkSocket(roomId: string, sessionID: string, socketID: string) {
  for (const [key, rec] of nostrLinkByRoomPubkey.entries()) {
    if (rec.roomId === roomId && rec.sessionID === sessionID) {
      rec.socketID = socketID;
      nostrLinkByRoomPubkey.set(key, rec);
    }
  }
}

export function clearNostrSessionStateOnLeave(
  sessionID: string,
  roomId: string,
  opts: { releaseSeat: boolean; hasPaidSeat: boolean }
) {
  pendingNostrChallengeBySession.delete(sessionID);
  if (!opts.hasPaidSeat || opts.releaseSeat) {
    for (const key of [...nostrLinkByRoomPubkey.keys()]) {
      const rec = nostrLinkByRoomPubkey.get(key);
      if (rec && rec.roomId === roomId && rec.sessionID === sessionID) {
        nostrLinkByRoomPubkey.delete(key);
      }
    }
  }
}

export function consumePin(pinRaw: string, roomId: string) {
  const pin = pinRaw.trim();
  const key = pinRecordKey(roomId, pin);
  const record = pinByValue.get(key);
  if (!record) {
    logOnlineState(`consume pin failed roomId=${roomId} pin=${pin} reason=not_found`);
    return { ok: false as const, reason: 'not_found' };
  }
  if (record.roomId !== roomId) {
    logOnlineState(`consume pin failed roomId=${roomId} pin=${pin} reason=room_mismatch`);
    return { ok: false as const, reason: 'room_mismatch' };
  }
  if (record.used) {
    logOnlineState(`consume pin failed roomId=${roomId} pin=${pin} reason=already_used`);
    return { ok: false as const, reason: 'already_used' };
  }
  if (record.expiresAt <= Date.now() && !shouldPinStayActive(record)) {
    pinByValue.delete(key);
    logOnlineState(`consume pin failed roomId=${roomId} pin=${pin} reason=expired`);
    return { ok: false as const, reason: 'expired' };
  }
  // Keep the pin alive while user is still in room and seats are open.
  if (shouldPinStayActive(record)) {
    record.expiresAt = Date.now() + PIN_TTL_MS;
  }
  record.used = true;
  record.usedAt = Date.now();
  pinByValue.set(key, record);
  logOnlineState(`consumed pin roomId=${roomId} pin=${pin} session=${record.sessionID}`);
  return { ok: true as const, record };
}

export function seatPaidPlayer(params: {
  roomId: string;
  sessionID: string;
  socketID: string;
  amount: number;
  name: string;
  picture?: string;
  pubkey?: string;
  lnAddress?: string;
}) {
  const room = roomById.get(params.roomId);
  if (!room) {
    return { ok: false as const, reason: 'room_not_found' };
  }
  for (const seat of room.seats.values()) {
    if (seat.sessionID === params.sessionID && seat.status === 'paid') {
      logOnlineState(
        `seat already paid roomId=${params.roomId} session=${params.sessionID} role=${seat.role}`
      );
      return { ok: true as const, role: seat.role, room };
    }
  }
  if (room.postGame.rematchRequested) {
    logOnlineState(
      `seat assignment blocked roomId=${params.roomId} session=${params.sessionID} reason=rematch_locked`
    );
    return { ok: false as const, reason: 'rematch_locked' };
  }
  const seatRoles: Array<PlayerRole.Player1 | PlayerRole.Player2> = [
    PlayerRole.Player1,
    PlayerRole.Player2,
  ];
  const openSeat = seatRoles.find((role) => {
    const seat = room.seats.get(role)!;
    return seat.status === 'open';
  });
  if (!openSeat) {
    logOnlineState(`seat assignment failed roomId=${params.roomId} session=${params.sessionID} reason=seats_full`);
    return { ok: false as const, reason: 'seats_full' };
  }
  const now = Date.now();
  room.seats.set(openSeat, {
    role: openSeat,
    sessionID: params.sessionID,
    socketID: params.socketID,
    status: 'paid',
    paidAmount: params.amount,
    paidAt: now,
    ready: false,
    disconnectedAt: undefined,
    name: params.name,
    picture: params.picture,
    pubkey: params.pubkey,
    lnAddress: params.lnAddress,
  });
  room.spectators.delete(params.sessionID);
  syncAuthoritativePlayers(room.roomId);
  room.updatedAt = now;
  logOnlineState(
    `seat assigned roomId=${params.roomId} session=${params.sessionID} role=${openSeat} amount=${params.amount}`
  );
  return { ok: true as const, role: openSeat, room };
}

export function setRoomPhase(roomId: string, phase: OnlineRoom['phase']) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.phase === phase) {
    return;
  }
  const prevPhase = room.phase;
  room.phase = phase;
  room.snapshot.phase = phase;
  if (phase === 'playing' && prevPhase === 'lobby') {
    room.matchRound += 1;
  }
  if (phase === 'playing') {
    startOnlineCountdown(room.snapshot.state);
    room.postGame.doubleOrNothingVotes.clear();
    room.postGame.settledAt = undefined;
    for (const [role, seat] of room.seats.entries()) {
      if (seat.status === 'paid') {
        room.seats.set(role, { ...seat, ready: false });
      }
    }
    resetReplay(room);
    pushReplayFrame(room);
  }
  if (phase === 'postgame') {
    ensurePostGameState(room);
    room.replay.recordedAt = Date.now();
    void appendOnlineMatchArchive({
      version: 1,
      kind: 'match',
      roomId: room.roomId,
      matchRound: room.matchRound,
      archiveId: `${room.roomId}-r${room.matchRound}`,
      finishedAt: Date.now(),
      serializedRoom: serializeRoom(room) as Record<string, unknown>,
      replay: packReplayForArchive([...room.replay.frames], room.replay.tickMs, room.replay.blockEvents),
    });
  }
  room.updatedAt = Date.now();
  logOnlineState(`phase changed roomId=${roomId} ${prevPhase} -> ${phase}`);
}

export function isPaidSeatSession(roomId: string, sessionID: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return false;
  }
  return [...room.seats.values()].some(
    (seat) => seat.status === 'paid' && seat.sessionID === sessionID
  );
}

export function areSeatsFilled(roomId: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return false;
  }
  return [...room.seats.values()].every((seat) => seat.status === 'paid');
}

export function hasAnyPaidSeat(roomId: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return false;
  }
  return [...room.seats.values()].some((seat) => seat.status === 'paid');
}

export function setSeatReady(roomId: string, sessionID: string, ready: boolean) {
  const room = roomById.get(roomId);
  if (!room || room.phase !== 'lobby') {
    return { ok: false as const, reason: 'room_not_ready' };
  }
  if (room.postGame.settledAt) {
    return { ok: false as const, reason: 'postgame_settled' };
  }
  let seatRole: PlayerRole.Player1 | PlayerRole.Player2 | undefined;
  for (const [role, seat] of room.seats.entries()) {
    if (seat.status === 'paid' && seat.sessionID === sessionID) {
      seatRole = role;
      break;
    }
  }
  if (!seatRole) {
    return { ok: false as const, reason: 'not_paid_player' };
  }
  const seat = room.seats.get(seatRole)!;
  room.seats.set(seatRole, { ...seat, ready, disconnectedAt: undefined });
  room.updatedAt = Date.now();
  const started = maybeStartReadyMatch(room);
  return { ok: true as const, started };
}

export function markOnlineRoomSettledBySession(sessionID: string) {
  const room = [...roomById.values()].find((candidate) =>
    [...candidate.seats.values()].some(
      (seat) => seat.status === 'paid' && seat.sessionID === sessionID
    )
  );
  if (!room || room.phase !== 'finished') {
    return;
  }
  room.postGame.settledAt = Date.now();
  room.updatedAt = Date.now();
  logOnlineState(`postgame settled roomId=${room.roomId} by session=${sessionID}`);
  const roomId = room.roomId;
  deleteRoom(roomId);
}

export function updateRoomInput(
  roomId: string,
  sessionID: string,
  input: { up?: boolean; down?: boolean; left?: boolean; right?: boolean }
) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  room.inputBySession.set(sessionID, {
    up: !!input.up,
    down: !!input.down,
    left: !!input.left,
    right: !!input.right,
  });
  room.updatedAt = Date.now();
  applyOnlineInputsToState(room);
}

/**
 * Apply latest held keys to dirWanted immediately (called on every roomInput and each sim tick).
 * Physics still advances at ONLINE_TICK_MS; this avoids missed taps between 100ms steps.
 */
export function applyOnlineInputsToState(room: OnlineRoom): void {
  if (room.phase !== 'playing') {
    return;
  }
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  if (!p1?.sessionID || !p2?.sessionID) {
    return;
  }

  const p1Input = room.inputBySession.get(p1.sessionID) ?? {};
  const p2Input = room.inputBySession.get(p2.sessionID) ?? {};
  const state = room.snapshot.state;
  if (!state.gameStarted && !state.countdownStart) {
    startOnlineCountdown(state);
  }
  if (p1Input.up) setOnlineWantedDirection(state, 'P1', 'Up');
  if (p1Input.down) setOnlineWantedDirection(state, 'P1', 'Down');
  if (p1Input.left) setOnlineWantedDirection(state, 'P1', 'Left');
  if (p1Input.right) setOnlineWantedDirection(state, 'P1', 'Right');
  if (p2Input.up) setOnlineWantedDirection(state, 'P2', 'Up');
  if (p2Input.down) setOnlineWantedDirection(state, 'P2', 'Down');
  if (p2Input.left) setOnlineWantedDirection(state, 'P2', 'Left');
  if (p2Input.right) setOnlineWantedDirection(state, 'P2', 'Right');
}

export function stepRoomSnapshot(roomId: string) {
  const room = roomById.get(roomId);
  if (!room || room.phase !== 'playing') {
    return;
  }
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  if (!p1?.sessionID || !p2?.sessionID) {
    return;
  }

  const state = room.snapshot.state;
  applyOnlineInputsToState(room);

  stepOnlineGame(state);
  room.snapshot.hud = getOnlineHudState(state);
  room.snapshot.tick += 1;
  // Record this tick before postgame: `setRoomPhase` archives replay and must run after the final frame exists.
  pushReplayFrame(room);
  if (state.gameEnded) {
    setRoomPhase(roomId, 'postgame');
  }
  room.updatedAt = Date.now();
}

/** Compact wire payload; client gunzips + decodes to full frames. */
export function getOnlineReplay(
  roomId: string,
  matchRound?: number
): OnlineReplayWirePayload | undefined {
  const room = roomById.get(roomId);
  if (room && room.replay.frames.length > 0) {
    if (matchRound == null || matchRound === room.matchRound) {
      const packed = packReplayForArchive(room.replay.frames, room.replay.tickMs, room.replay.blockEvents);
      return {
        roomId: room.roomId,
        matchRound: room.matchRound,
        ...packed,
      };
    }
  }
  return loadCompactReplayFromArchiveSync(roomId, matchRound);
}

export function serializeRoom(room: OnlineRoom) {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    hostSessionID: room.hostSessionID,
    buyin: room.buyin,
    matchRound: room.matchRound,
    createdAt: room.createdAt,
    finishedAt:
      room.phase === 'finished'
        ? room.postGame.settledAt ?? room.updatedAt
        : undefined,
    phase: room.phase,
    kind1EventId: room.kind1EventId,
    nostrMeta: room.nostrMeta,
    seats: Object.fromEntries(room.seats),
    spectators: [...room.spectators],
    snapshot: room.snapshot,
    result:
      room.phase === 'postgame' || room.phase === 'finished'
        ? roomToFinishedResult(room)
        : undefined,
    replay: {
      available: room.replay.frames.length > 0,
      frameCount: room.replay.frames.length,
      tickMs: room.replay.tickMs,
      durationMs: room.replay.frames.length * room.replay.tickMs,
    },
    postGame: {
      p1Picture: room.postGame.p1Picture,
      p2Picture: room.postGame.p2Picture,
      winnerRole: room.postGame.winnerRole,
      winnerSessionID: room.postGame.winnerSessionID,
      winnerName: room.postGame.winnerName,
      winnerPicture: room.postGame.winnerPicture,
      winnerPoints: room.postGame.winnerPoints,
      totalPrize: room.postGame.totalPrize,
      lnurlw: room.postGame.lnurlw,
      payoutMethod: room.postGame.payoutMethod,
      payoutTarget: room.postGame.payoutTarget,
      rematchRequested: room.postGame.rematchRequested,
      rematchRequiredAmount: room.postGame.rematchRequiredAmount,
      rematchEventId: room.postGame.rematchEventId,
      rematchNote1: room.postGame.rematchNote1,
      rematchWaitingForSessionID: room.postGame.rematchWaitingForSessionID,
      doubleOrNothingVotes: room.postGame.doubleOrNothingVotes.size,
    },
  };
}

export function getOnlinePostGame(roomId: string) {
  const room = roomById.get(roomId);
  if (room && (room.phase === 'postgame' || room.phase === 'finished')) {
    ensurePostGameState(room);
    return {
      roomId: room.roomId,
      phase: room.phase,
      p1Name: room.seats.get(PlayerRole.Player1)?.name ?? 'Player 1',
      p2Name: room.seats.get(PlayerRole.Player2)?.name ?? 'Player 2',
      p1Picture: room.seats.get(PlayerRole.Player1)?.picture ?? room.postGame.p1Picture,
      p2Picture: room.seats.get(PlayerRole.Player2)?.picture ?? room.postGame.p2Picture,
      p1Points: room.snapshot.state.score[0],
      p2Points: room.snapshot.state.score[1],
      winnerRole: room.postGame.winnerRole,
      winnerSessionID: room.postGame.winnerSessionID,
      winnerName: room.postGame.winnerName,
      winnerPicture: room.postGame.winnerPicture,
      winnerPoints: room.postGame.winnerPoints,
      totalPrize: room.postGame.totalPrize,
      lnurlw: room.postGame.lnurlw,
      payoutMethod: room.postGame.payoutMethod,
      payoutTarget: room.postGame.payoutTarget,
      rematchRequested: room.postGame.rematchRequested,
      rematchRequiredAmount: room.postGame.rematchRequiredAmount,
      rematchEventId: room.postGame.rematchEventId,
      rematchNote1: room.postGame.rematchNote1,
      rematchWaitingForSessionID: room.postGame.rematchWaitingForSessionID,
      winnerLnAddress:
        room.postGame.winnerRole != null
          ? room.seats.get(room.postGame.winnerRole)?.lnAddress
          : undefined,
      doubleOrNothingVotes: room.postGame.doubleOrNothingVotes.size,
    };
  }
  return getOnlinePostGameFromArchive(roomId);
}

export function setOnlinePostGameLnurlw(roomId: string, lnurlw: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.postGame.rematchEventId) {
    roomIdByKind1EventId.delete(room.postGame.rematchEventId);
  }
  room.postGame.lnurlw = lnurlw;
  room.postGame.payoutMethod = 'withdraw_qr';
  room.postGame.payoutTarget = undefined;
  room.postGame.rematchRequested = false;
  room.postGame.rematchRequiredAmount = undefined;
  room.postGame.rematchEventId = undefined;
  room.postGame.rematchNote1 = undefined;
  room.postGame.rematchWaitingForSessionID = undefined;
  room.updatedAt = Date.now();
  logOnlineState(`set postgame lnurlw roomId=${roomId}`);
  if (room.phase === 'postgame') {
    setRoomPhase(roomId, 'finished');
  }
}

export function setOnlinePostGameNostrPayout(roomId: string, lnAddress: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  if (room.postGame.rematchEventId) {
    roomIdByKind1EventId.delete(room.postGame.rematchEventId);
  }
  room.postGame.payoutMethod = 'nostr_zap';
  room.postGame.payoutTarget = lnAddress;
  room.postGame.rematchRequested = false;
  room.postGame.rematchRequiredAmount = undefined;
  room.postGame.rematchEventId = undefined;
  room.postGame.rematchNote1 = undefined;
  room.postGame.rematchWaitingForSessionID = undefined;
  room.updatedAt = Date.now();
  logOnlineState(`set postgame nostr payout roomId=${roomId} lnAddress=${lnAddress}`);
  if (room.phase === 'postgame') {
    setRoomPhase(roomId, 'finished');
  }
}

export function setOnlineRematchRequested(params: {
  roomId: string;
  requiredAmount: number;
  rematchEventId: string;
  rematchNote1: string;
  waitingForSessionID?: string;
}) {
  const room = roomById.get(params.roomId);
  if (!room || room.phase !== 'postgame') {
    return;
  }
  room.postGame.rematchRequested = true;
  room.postGame.rematchRequiredAmount = params.requiredAmount;
  room.postGame.rematchEventId = params.rematchEventId;
  room.postGame.rematchNote1 = params.rematchNote1;
  room.postGame.rematchWaitingForSessionID = params.waitingForSessionID;
  roomIdByKind1EventId.set(params.rematchEventId, params.roomId);
  room.postGame.payoutMethod = undefined;
  room.postGame.payoutTarget = undefined;
  room.postGame.lnurlw = undefined;
  room.updatedAt = Date.now();
  logOnlineState(
    `rematch requested roomId=${params.roomId} amount=${params.requiredAmount} event=${params.rematchEventId}`
  );
}

export function settleOnlineRematchPayment(params: {
  roomId: string;
  payerPubkey?: string;
  amount: number;
}) {
  const room = roomById.get(params.roomId);
  if (!room || room.phase !== 'postgame') {
    return { ok: false as const, reason: 'room_not_finished' };
  }
  if (!room.postGame.rematchRequested || !room.postGame.rematchRequiredAmount) {
    return { ok: false as const, reason: 'rematch_not_requested' };
  }
  const requiredAmount = room.postGame.rematchRequiredAmount;
  if (params.amount < requiredAmount) {
    return { ok: false as const, reason: 'amount_too_low' };
  }
  const winnerRole = room.postGame.winnerRole;
  if (!winnerRole) {
    return { ok: false as const, reason: 'winner_unknown' };
  }
  const loserRole = winnerRole === PlayerRole.Player1 ? PlayerRole.Player2 : PlayerRole.Player1;
  const winnerSeat = room.seats.get(winnerRole);
  const loserSeat = room.seats.get(loserRole);
  if (!winnerSeat || !loserSeat || !winnerSeat.sessionID || !loserSeat.sessionID) {
    return { ok: false as const, reason: 'seats_not_ready' };
  }
  if (loserSeat.pubkey && (!params.payerPubkey || params.payerPubkey !== loserSeat.pubkey)) {
    return { ok: false as const, reason: 'not_loser' };
  }
  if (winnerSeat.pubkey && params.payerPubkey && params.payerPubkey === winnerSeat.pubkey) {
    return { ok: false as const, reason: 'winner_cannot_match' };
  }
  room.seats.set(winnerRole, {
    ...winnerSeat,
    paidAmount: requiredAmount,
    ready: false,
    disconnectedAt: undefined,
  });
  room.seats.set(loserRole, {
    ...loserSeat,
    paidAmount: requiredAmount,
    ready: false,
    disconnectedAt: undefined,
  });
  resetRoomToLobby(room);
  room.updatedAt = Date.now();
  logOnlineState(`rematch paid roomId=${params.roomId} amount=${requiredAmount}`);
  return { ok: true as const, room, requiredAmount };
}

export function voteOnlineDoubleOrNothing(roomId: string, sessionID: string) {
  const room = roomById.get(roomId);
  if (!room || room.phase !== 'postgame') {
    return { ok: false as const, reason: 'room_not_postgame' };
  }
  // Once payout flow is started for this round, rematch is no longer allowed.
  if (room.postGame.lnurlw || room.postGame.payoutMethod === 'nostr_zap') {
    return { ok: false as const, reason: 'withdraw_started' };
  }
  if (room.postGame.rematchRequested) {
    return { ok: false as const, reason: 'rematch_pending' };
  }
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  const isPlayer = p1?.sessionID === sessionID || p2?.sessionID === sessionID;
  if (!isPlayer) {
    return { ok: false as const, reason: 'not_player' };
  }
  room.postGame.doubleOrNothingVotes.add(sessionID);
  room.updatedAt = Date.now();
  const agreed =
    p1?.sessionID != null &&
    p2?.sessionID != null &&
    room.postGame.doubleOrNothingVotes.has(p1.sessionID) &&
    room.postGame.doubleOrNothingVotes.has(p2.sessionID);
  logOnlineState(
    `double-or-nothing vote roomId=${roomId} session=${sessionID} votes=${room.postGame.doubleOrNothingVotes.size} agreed=${agreed}`
  );
  return {
    ok: true as const,
    votes: room.postGame.doubleOrNothingVotes.size,
    agreed,
  };
}

function syncAuthoritativePlayers(roomId: string) {
  const room = roomById.get(roomId);
  if (!room) return;
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  const state = room.snapshot.state;
  state.p1Name = p1?.name ?? 'Player 1';
  state.p2Name = p2?.name ?? 'Player 2';
  const p1Amount = Math.floor(p1?.paidAmount ?? room.buyin);
  const p2Amount = Math.floor(p2?.paidAmount ?? room.buyin);
  state.initialScore = [p1Amount, p2Amount];
  state.score = [p1Amount, p2Amount];
  state.totalPoints = p1Amount + p2Amount;
  room.snapshot.hud = getOnlineHudState(state);
}

function cleanupExpiredState() {
  const now = Date.now();
  for (const [key, record] of pinByValue.entries()) {
    if (
      (record.expiresAt <= now && !shouldPinStayActive(record)) ||
      (record.used && (record.usedAt ?? 0) + PIN_TTL_MS < now)
    ) {
      logOnlineState(`cleanup pin roomId=${record.roomId} pin=${record.pin}`);
      pinByValue.delete(key);
    }
  }
  for (const [sid, p] of pendingNostrChallengeBySession.entries()) {
    if (p.expiresAt <= now) {
      pendingNostrChallengeBySession.delete(sid);
    }
  }
  for (const key of [...nostrLinkByRoomPubkey.keys()]) {
    const rec = nostrLinkByRoomPubkey.get(key);
    if (rec && rec.expiresAt <= now) {
      nostrLinkByRoomPubkey.delete(key);
    }
  }
  for (const room of roomById.values()) {
    releaseExpiredPaidSeats(room, now);

    if (room.postGame.settledAt && now - room.postGame.settledAt > SETTLED_ROOM_DELETE_FALLBACK_MS) {
      logOnlineState(
        `cleanup settled room fallback roomId=${room.roomId} settledMs=${now - room.postGame.settledAt}`
      );
      deleteRoom(room.roomId);
      continue;
    }

    if (shouldDeleteIdleRoom(room, now)) {
      logOnlineState(`cleanup idle room roomId=${room.roomId} inactiveMs=${now - room.updatedAt}`);
      deleteRoom(room.roomId);
    }
  }
}

setInterval(() => {
  cleanupExpiredState();
}, ROOM_CLEANUP_MS);

function shouldPinStayActive(record: JoinPinRecord) {
  const room = roomById.get(record.roomId);
  if (!room) {
    return false;
  }
  const hasOpenSeats = [...room.seats.values()].some((seat) => seat.status === 'open');
  const userStillInRoom = room.members.has(record.sessionID);
  return hasOpenSeats && userStillInRoom;
}

function pinRecordKey(roomId: string, pin: string) {
  return `${roomId}:${pin}`;
}

function shouldDeleteIdleRoom(room: OnlineRoom, now: number) {
  const inactiveFor = now - room.updatedAt;
  if (inactiveFor <= ROOM_IDLE_TTL_MS) {
    return false;
  }
  const hasPaidSeat = [...room.seats.values()].some((seat) => seat.status === 'paid');
  if (hasPaidSeat) {
    return false;
  }
  if (room.members.size > 0) {
    return false;
  }
  return true;
}

function releaseExpiredPaidSeats(room: OnlineRoom, now: number) {
  let released = false;
  for (const [role, seat] of room.seats.entries()) {
    if (
      seat.status === 'paid' &&
      seat.disconnectedAt &&
      now - seat.disconnectedAt > SEAT_DISCONNECT_TTL_MS
    ) {
      if (seat.sessionID) {
        roomIdBySession.delete(seat.sessionID);
      }
      room.seats.set(role, { role, status: 'open' });
      room.inputBySession.delete(seat.sessionID ?? '');
      released = true;
      logOnlineState(
        `released stale paid seat roomId=${room.roomId} role=${role} offlineMs=${now - seat.disconnectedAt}`
      );
    }
  }
  if (released) {
    room.phase = 'lobby';
    room.snapshot.phase = 'lobby';
    room.postGame.doubleOrNothingVotes.clear();
    room.postGame.settledAt = undefined;
    room.updatedAt = now;
  }
}

function ensurePostGameState(room: OnlineRoom) {
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  const winnerRole =
    room.snapshot.state.winnerPlayer === 'P2' ? PlayerRole.Player2 : PlayerRole.Player1;
  const winnerSeat = winnerRole === PlayerRole.Player1 ? p1 : p2;
  const winnerPoints = winnerRole === PlayerRole.Player1 ? room.snapshot.state.score[0] : room.snapshot.state.score[1];
  room.postGame.p1Picture = p1?.picture;
  room.postGame.p2Picture = p2?.picture;
  room.postGame.winnerRole = winnerRole;
  room.postGame.winnerSessionID = winnerSeat?.sessionID;
  room.postGame.winnerName = winnerSeat?.name ?? room.snapshot.state.winnerName ?? 'Player 1';
  room.postGame.winnerPicture = winnerSeat?.picture;
  room.postGame.winnerPoints = winnerPoints;
  room.postGame.totalPrize = room.snapshot.state.totalPoints;
}

function resetRoomToLobby(room: OnlineRoom) {
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  const p1Name = p1?.name ?? 'Player 1';
  const p2Name = p2?.name ?? 'Player 2';
  const p1Points = Math.max(1, Math.floor(p1?.paidAmount ?? room.buyin));
  const p2Points = Math.max(1, Math.floor(p2?.paidAmount ?? room.buyin));
  room.snapshot = {
    tick: 0,
    phase: 'lobby',
    state: createOnlineGameState({
      p1Name,
      p2Name,
      p1Points,
      p2Points,
    }),
    hud: {
      p1Points,
      p2Points,
      captureP1: '2%',
      captureP2: '2%',
      initialWidthP1: 50,
      initialWidthP2: 50,
      currentWidthP1: 50,
      currentWidthP2: 50,
    },
  };
  resetReplay(room);
  room.phase = 'lobby';
  room.inputBySession.clear();
  if (room.postGame.rematchEventId) {
    roomIdByKind1EventId.delete(room.postGame.rematchEventId);
  }
  room.postGame.doubleOrNothingVotes.clear();
  room.postGame.lnurlw = undefined;
  room.postGame.payoutMethod = undefined;
  room.postGame.payoutTarget = undefined;
  room.postGame.rematchRequested = false;
  room.postGame.rematchRequiredAmount = undefined;
  room.postGame.rematchEventId = undefined;
  room.postGame.rematchNote1 = undefined;
  room.postGame.rematchWaitingForSessionID = undefined;
  room.postGame.settledAt = undefined;
  room.postGame.winnerRole = undefined;
  room.postGame.winnerSessionID = undefined;
  room.postGame.p1Picture = undefined;
  room.postGame.p2Picture = undefined;
  room.postGame.winnerName = '';
  room.postGame.winnerPicture = undefined;
  room.postGame.winnerPoints = 0;
  room.postGame.totalPrize = 0;
  room.updatedAt = Date.now();
  logOnlineState(`double-or-nothing agreed; reset to lobby roomId=${room.roomId}`);
}

function maybeStartReadyMatch(room: OnlineRoom) {
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  const bothReady =
    p1?.status === 'paid' &&
    p2?.status === 'paid' &&
    p1.ready === true &&
    p2.ready === true &&
    !!p1.sessionID &&
    !!p2.sessionID &&
    room.members.has(p1.sessionID) &&
    room.members.has(p2.sessionID);
  if (!bothReady) {
    return false;
  }
  setRoomPhase(room.roomId, 'playing');
  return true;
}

function cloneSnapshot(snapshot: OnlineRoom['snapshot']): OnlineRoom['snapshot'] {
  return JSON.parse(JSON.stringify(snapshot)) as OnlineRoom['snapshot'];
}

function resetReplay(room: OnlineRoom) {
  room.replay.frames = [];
  room.replay.recordedAt = undefined;
  room.replay.blockEvents = undefined;
}

function pushReplayFrame(room: OnlineRoom) {
  room.replay.frames.push(cloneSnapshot(room.snapshot));
  if (room.replay.frames.length > ONLINE_REPLAY_MAX_FRAMES) {
    room.replay.frames.splice(0, room.replay.frames.length - ONLINE_REPLAY_MAX_FRAMES);
  }
}
