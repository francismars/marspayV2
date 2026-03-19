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

const PIN_TTL_MS = 2 * 60 * 1000;
const ROOM_IDLE_TTL_MS = 20 * 60 * 1000;
const ROOM_CLEANUP_MS = 15 * 1000;
const SEAT_DISCONNECT_TTL_MS = 15 * 60 * 1000;
const POSTGAME_SETTLED_DELETE_MS = 2 * 60 * 1000;

const roomById = new Map<string, OnlineRoom>();
const roomIdByCode = new Map<string, string>();
const roomIdBySession = new Map<string, string>();
const pinByValue = new Map<string, JoinPinRecord>();

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
    postGame: {
      winnerName: '',
      winnerPoints: 0,
      totalPrize: 0,
      doubleOrNothingVotes: new Set<string>(),
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

export function listOnlineRooms(): OnlineRoomListItem[] {
  return [...roomById.values()].map((room) => ({
    roomId: room.roomId,
    roomCode: room.roomCode,
    buyin: room.buyin,
    createdAt: room.createdAt,
    phase: room.phase,
    playersPaid: [...room.seats.values()].filter((seat) => seat.status === 'paid').length,
    seatsTotal: 2,
    spectators: room.spectators.size,
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
  room.nostrMeta = nostrMeta;
  room.kind1EventId = kind1EventId;
  room.updatedAt = Date.now();
  logOnlineState(`set nostr meta roomId=${roomId} note=${nostrMeta.note1} emojis=${nostrMeta.emojis}`);
}

export function issueJoinPin(roomId: string, sessionID: string, socketID: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  let pin = randomNumericPin(6);
  while (pinByValue.has(pin)) {
    pin = randomNumericPin(6);
  }
  const record: JoinPinRecord = {
    pin,
    roomId,
    sessionID,
    socketID,
    expiresAt: Date.now() + PIN_TTL_MS,
    used: false,
  };
  pinByValue.set(pin, record);
  logOnlineState(
    `issued pin roomId=${roomId} session=${sessionID} socket=${socketID} expiresAt=${record.expiresAt}`
  );
  return record;
}

export function consumePin(pinRaw: string, roomId: string) {
  const pin = pinRaw.trim();
  const record = pinByValue.get(pin);
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
    pinByValue.delete(pin);
    logOnlineState(`consume pin failed roomId=${roomId} pin=${pin} reason=expired`);
    return { ok: false as const, reason: 'expired' };
  }
  // Keep the pin alive while user is still in room and seats are open.
  if (shouldPinStayActive(record)) {
    record.expiresAt = Date.now() + PIN_TTL_MS;
  }
  record.used = true;
  record.usedAt = Date.now();
  pinByValue.set(pin, record);
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
  if (phase === 'playing') {
    startOnlineCountdown(room.snapshot.state);
    room.postGame.doubleOrNothingVotes.clear();
    room.postGame.settledAt = undefined;
    for (const [role, seat] of room.seats.entries()) {
      if (seat.status === 'paid') {
        room.seats.set(role, { ...seat, ready: false });
      }
    }
  }
  if (phase === 'finished') {
    ensurePostGameState(room);
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
  room.inputBySession.set(sessionID, input);
  room.updatedAt = Date.now();
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

  const p1Input = room.inputBySession.get(p1.sessionID) ?? {};
  const p2Input = room.inputBySession.get(p2.sessionID) ?? {};
  const state = room.snapshot.state;
  // Safety: if room is already in playing phase but countdown has not started,
  // force-start countdown so clients never get stuck on "press button to start".
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

  stepOnlineGame(state);
  room.snapshot.hud = getOnlineHudState(state);
  if (state.gameEnded) {
    ensurePostGameState(room);
    setRoomPhase(roomId, 'finished');
  }
  room.snapshot.tick += 1;
  room.updatedAt = Date.now();
}

export function serializeRoom(room: OnlineRoom) {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    hostSessionID: room.hostSessionID,
    buyin: room.buyin,
    phase: room.phase,
    kind1EventId: room.kind1EventId,
    nostrMeta: room.nostrMeta,
    seats: Object.fromEntries(room.seats),
    spectators: [...room.spectators],
    snapshot: room.snapshot,
    postGame: {
      winnerRole: room.postGame.winnerRole,
      winnerSessionID: room.postGame.winnerSessionID,
      winnerName: room.postGame.winnerName,
      winnerPicture: room.postGame.winnerPicture,
      winnerPoints: room.postGame.winnerPoints,
      totalPrize: room.postGame.totalPrize,
      lnurlw: room.postGame.lnurlw,
      doubleOrNothingVotes: room.postGame.doubleOrNothingVotes.size,
    },
  };
}

export function getOnlinePostGame(roomId: string) {
  const room = roomById.get(roomId);
  if (!room || room.phase !== 'finished') {
    return;
  }
  ensurePostGameState(room);
  return {
    roomId: room.roomId,
    phase: room.phase,
    p1Name: room.seats.get(PlayerRole.Player1)?.name ?? 'Player 1',
    p2Name: room.seats.get(PlayerRole.Player2)?.name ?? 'Player 2',
    p1Picture: room.seats.get(PlayerRole.Player1)?.picture,
    p2Picture: room.seats.get(PlayerRole.Player2)?.picture,
    p1Points: room.snapshot.state.score[0],
    p2Points: room.snapshot.state.score[1],
    winnerRole: room.postGame.winnerRole,
    winnerSessionID: room.postGame.winnerSessionID,
    winnerName: room.postGame.winnerName,
    winnerPicture: room.postGame.winnerPicture,
    winnerPoints: room.postGame.winnerPoints,
    totalPrize: room.postGame.totalPrize,
    lnurlw: room.postGame.lnurlw,
    doubleOrNothingVotes: room.postGame.doubleOrNothingVotes.size,
  };
}

export function setOnlinePostGameLnurlw(roomId: string, lnurlw: string) {
  const room = roomById.get(roomId);
  if (!room) {
    return;
  }
  room.postGame.lnurlw = lnurlw;
  room.updatedAt = Date.now();
  logOnlineState(`set postgame lnurlw roomId=${roomId}`);
}

export function voteOnlineDoubleOrNothing(roomId: string, sessionID: string) {
  const room = roomById.get(roomId);
  if (!room || room.phase !== 'finished') {
    return { ok: false as const, reason: 'room_not_finished' };
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
  if (agreed) {
    resetRoomToLobby(room);
  }
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
  for (const [pin, record] of pinByValue.entries()) {
    if (
      (record.expiresAt <= now && !shouldPinStayActive(record)) ||
      (record.used && (record.usedAt ?? 0) + PIN_TTL_MS < now)
    ) {
      logOnlineState(`cleanup pin roomId=${record.roomId} pin=${pin}`);
      pinByValue.delete(pin);
    }
  }
  for (const room of roomById.values()) {
    releaseExpiredPaidSeats(room, now);

    if (room.postGame.settledAt && now - room.postGame.settledAt > POSTGAME_SETTLED_DELETE_MS) {
      logOnlineState(
        `cleanup settled room roomId=${room.roomId} settledMs=${now - room.postGame.settledAt}`
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
  room.phase = 'lobby';
  room.inputBySession.clear();
  room.postGame.doubleOrNothingVotes.clear();
  room.postGame.lnurlw = undefined;
  room.postGame.settledAt = undefined;
  room.postGame.winnerRole = undefined;
  room.postGame.winnerSessionID = undefined;
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
