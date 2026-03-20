import { Socket } from 'socket.io';
import { publishGameKind1 } from '../calls/NDK/publishGameKind1';
import { publishOnlineKind1Reply } from '../calls/NDK/publishOnlineKind1Reply';
import { publishOnlineRematchKind1 } from '../calls/NDK/publishOnlineRematchKind1';
import { setNDKInstance } from '../calls/NDK/setNDKInstance';
import createLNURLW from '../calls/LNBits/createLNURLW';
import getLNURLCallback from '../calls/LNAddress/getLNURLCallback';
import getInvoiceFromCallback from '../calls/LNAddress/getInvoiceFromCallback';
import payInvoice from '../calls/LNBits/payInvoice';
import { P2PMAXWITHDRAWALS } from '../consts/values';
import { GameMode, PlayerRole } from '../types/game';
import type { OnlineRoomListItem } from '../types/online';
import { io } from '../server';
import { getKind1sfromSessionID } from '../state/nostrState';
import { setIDToLNURLW, setLNURLWToID } from '../state/lnurlwState';
import { listArchivedOnlineRoomsSync, loadSerializedRoomFromArchiveSync } from '../state/onlineRoomArchive';
import { dateNow } from '../utils/time';
import {
  areSeatsFilled,
  createOnlineRoom,
  deleteRoom,
  getOnlineReplay,
  getOnlinePostGame,
  getRoomByCode,
  getRoomById,
  hasAnyPaidSeat,
  isPaidSeatSession,
  issueJoinPin,
  joinRoom,
  leaveRoom,
  listOnlineRooms,
  serializeRoom,
  setSeatReady,
  setRoomNostrMeta,
  setRoomPhase,
  setOnlinePostGameLnurlw,
  setOnlinePostGameNostrPayout,
  setOnlineRematchRequested,
  stepRoomSnapshot,
  updateRoomInput,
  voteOnlineDoubleOrNothing,
} from '../state/onlineRoomState';

const ONLINE_TICK_MS = 100;
const ONLINE_PAYOUT_MULTIPLIER = 0.95;

function logOnline(sessionID: string | undefined, message: string) {
  const sessionTag = sessionID ?? 'unknown-session';
  console.log(`${dateNow()} [${sessionTag}] [ONLINE] ${message}`);
}

function emitOnlineRoomsList() {
  io.emit('resListOnlineRooms', {
    rooms: listOnlineRooms(),
  });
}

function getSeatMentions(roomId: string) {
  const room = getRoomById(roomId);
  if (!room) {
    return [] as Array<{ pubkey?: string; name?: string }>;
  }
  const p1 = room.seats.get(PlayerRole.Player1);
  const p2 = room.seats.get(PlayerRole.Player2);
  return [
    { pubkey: p1?.pubkey, name: p1?.name ?? 'Player 1' },
    { pubkey: p2?.pubkey, name: p2?.name ?? 'Player 2' },
  ];
}

function publishOnlineMatchStarted(roomId: string, sessionID: string) {
  const room = getRoomById(roomId);
  if (!room) {
    return;
  }
  const roomEmojis = room.nostrMeta?.emojis ?? '🎮🎮🎮🎮';
  void publishOnlineKind1Reply({
    sessionID,
    rootEventId: room.kind1EventId,
    content: `ONLINE MATCH STARTED ${roomEmojis}\n${room.snapshot.state.p1Name} vs ${room.snapshot.state.p2Name}.\nSpectators can now watch live in room ${room.roomCode}.`,
    mentions: getSeatMentions(room.roomId),
  });
}

export async function createOnlineRoomHandler(
  socket: Socket,
  payload?: { buyin?: number; hostLNAddress?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  logOnline(sessionID, `createOnlineRoom requested (buyin=${payload?.buyin ?? 'default'})`);
  const room = createOnlineRoom({
    hostSessionID: sessionID,
    hostSocketID: socket.id,
    buyin: payload?.buyin,
  });

  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  const pin = issueJoinPin(room.roomId, sessionID, socket.id);
  logOnline(
    sessionID,
    `room created roomId=${room.roomId} code=${room.roomCode} buyin=${room.buyin} pinIssued=${pin?.pin ?? 'none'}`
  );
  const roomState = serializeRoom(room);
  io.to(room.roomId).emit('onlineRoomUpdated', roomState);
  emitOnlineRoomsList();
  socket.emit('resCreateOnlineRoom', {
    roomId: room.roomId,
    roomCode: room.roomCode,
    joinPin: pin?.pin ?? '',
    pinExpiresAt: pin?.expiresAt ?? Date.now(),
    nostrMeta: room.nostrMeta,
    room: roomState,
  });

  // Publish Kind1 asynchronously so room creation UX is never blocked
  // by relay availability or NDK connection delays.
  void (async () => {
    try {
      logOnline(sessionID, `kind1 publish flow started roomId=${room.roomId}`);
      await setNDKInstance();
      logOnline(sessionID, `ndk initialized for roomId=${room.roomId}, publishing kind1`);
      await publishGameKind1(sessionID, {
        mode: GameMode.ONLINE,
        buyin: room.buyin,
        hostLNAddress: payload?.hostLNAddress,
        numberOfPlayers: 2,
        roomCode: room.roomCode,
      });
      logOnline(sessionID, `publishGameKind1 returned roomId=${room.roomId}`);
      const kind1 = getKind1sfromSessionID(sessionID)?.slice(-1)[0];
      if (kind1) {
        setRoomNostrMeta(
          room.roomId,
          {
            note1: kind1.note1,
            emojis: kind1.emojis,
            min: kind1.min,
            mode: kind1.mode,
          },
          kind1.id
        );
        const live = getRoomById(room.roomId);
        if (live) {
          io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(live));
        }
        logOnline(
          sessionID,
          `kind1 published roomId=${room.roomId} note=${kind1.note1} emojis=${kind1.emojis}`
        );
      } else {
        logOnline(sessionID, `kind1 publish returned no local kind1 record roomId=${room.roomId}`);
      }
    } catch (error) {
      console.error(`Failed to publish ONLINE room kind1 ${room.roomId}:`, error);
    }
  })();
}

export function listOnlineRoomsHandler(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  logOnline(sessionID, `listOnlineRooms requested`);
  socket.emit('resListOnlineRooms', {
    rooms: listOnlineRooms(),
  });
}

export function listOnlineArchivedRoomsHandler(socket: Socket) {
  const sessionID = socket.data.sessionID as string | undefined;
  logOnline(sessionID, `listOnlineArchivedRooms requested`);
  const rooms: OnlineRoomListItem[] = listArchivedOnlineRoomsSync().map((r) => ({
    roomId: r.roomId,
    roomCode: r.roomCode,
    buyin: r.buyin,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    phase: 'finished',
    playersPaid: r.playersPaid,
    seatsTotal: r.seatsTotal,
    spectators: r.spectators,
    archived: true,
    replay: r.replay,
    result: r.result,
  }));
  socket.emit('resListOnlineArchivedRooms', { rooms });
}

export function joinOnlineRoomHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  logOnline(sessionID, `joinOnlineRoom requested roomId=${payload.roomId}`);
  const room = joinRoom(payload.roomId, sessionID, socket.id);
  if (!room) {
    logOnline(sessionID, `joinOnlineRoom failed roomId=${payload.roomId} reason=room_not_found`);
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  const pin = issueJoinPin(room.roomId, sessionID, socket.id);
  logOnline(
    sessionID,
    `joined roomId=${room.roomId} code=${room.roomCode} pinIssued=${pin?.pin ?? 'none'}`
  );
  const roomState = serializeRoom(room);
  io.to(room.roomId).emit('onlineRoomUpdated', roomState);
  emitOnlineRoomsList();
  socket.emit('resJoinOnlineRoom', {
    roomId: room.roomId,
    roomCode: room.roomCode,
    joinPin: pin?.pin ?? '',
    pinExpiresAt: pin?.expiresAt ?? Date.now(),
    nostrMeta: room.nostrMeta,
    room: roomState,
  });
}

export function joinOnlineRoomByCodeHandler(socket: Socket, payload: { roomCode: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  logOnline(sessionID, `joinOnlineRoomByCode requested code=${payload.roomCode}`);
  const room = getRoomByCode(payload.roomCode);
  if (!room) {
    logOnline(sessionID, `joinOnlineRoomByCode failed code=${payload.roomCode} reason=room_not_found`);
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  joinOnlineRoomHandler(socket, { roomId: room.roomId });
}

export function spectateOnlineRoomHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  logOnline(sessionID, `spectateOnlineRoom requested roomId=${payload.roomId}`);
  const room = joinRoom(payload.roomId, sessionID, socket.id);
  if (!room) {
    logOnline(sessionID, `spectateOnlineRoom failed roomId=${payload.roomId} reason=room_not_found`);
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  logOnline(sessionID, `spectating roomId=${room.roomId} code=${room.roomCode}`);
  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
  emitOnlineRoomsList();
}

export function getOnlineRoomStateHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (room) {
    logOnline(sessionID, `getOnlineRoomState roomId=${room.roomId} phase=${room.phase}`);
    socket.emit('onlineRoomUpdated', serializeRoom(room));
    return;
  }
  const archived = loadSerializedRoomFromArchiveSync(payload.roomId);
  if (archived) {
    logOnline(sessionID, `getOnlineRoomState from archive roomId=${payload.roomId}`);
    socket.emit('onlineRoomUpdated', archived);
    return;
  }
  logOnline(sessionID, `getOnlineRoomState failed roomId=${payload.roomId} reason=room_not_found`);
  socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
}

export function leaveOnlineRoomHandler(socket: Socket, payload?: { roomId?: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const room = payload?.roomId ? getRoomById(payload.roomId) : undefined;
  const roomId = room?.roomId;
  if (roomId) {
    socket.leave(roomId);
    socket.data.currentOnlineRoomId = undefined;
  }
  logOnline(sessionID, `leaveOnlineRoom roomId=${roomId ?? 'unknown'}`);
  leaveRoom(sessionID, { releaseSeat: true });
  emitOnlineRoomsList();
}

export function cancelOnlineRoomHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (!sessionID || !room || !room.members.has(sessionID)) {
    logOnline(sessionID, `cancelOnlineRoom denied roomId=${payload.roomId}`);
    return;
  }
  if (hasAnyPaidSeat(payload.roomId)) {
    logOnline(sessionID, `cancelOnlineRoom blocked roomId=${payload.roomId} reason=paid_seat_exists`);
    socket.emit('onlinePinInvalid', { reason: 'room_has_paid_seats' });
    return;
  }
  logOnline(sessionID, `cancelOnlineRoom roomId=${room.roomId}`);
  setRoomPhase(room.roomId, 'cancelled');
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
  deleteRoom(room.roomId);
  emitOnlineRoomsList();
}

export function roomInputHandler(
  socket: Socket,
  payload: { roomId: string; input: { up?: boolean; down?: boolean; left?: boolean; right?: boolean } }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const room = getRoomById(payload.roomId);
  if (!room) {
    return;
  }
  if (room.phase !== 'playing') {
    return;
  }
  const paidBySession = isPaidSeatSession(payload.roomId, sessionID);
  const paidBySocket = [...room.seats.values()].some(
    (seat) => seat.status === 'paid' && seat.socketID === socket.id
  );
  if (!paidBySession && !paidBySocket) {
    logOnline(
      sessionID,
      `roomInput denied roomId=${payload.roomId} reason=not_paid_player socket=${socket.id}`
    );
    return;
  }
  updateRoomInput(payload.roomId, sessionID, payload.input);
}

export function startOnlineGameHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (!sessionID || !room) {
    logOnline(sessionID, `startOnlineGame denied roomId=${payload.roomId}`);
    return;
  }
  const ready = setSeatReady(payload.roomId, sessionID, true);
  if (!ready.ok) {
    logOnline(sessionID, `startOnlineGame blocked roomId=${payload.roomId} reason=${ready.reason}`);
    socket.emit('onlinePinInvalid', { reason: ready.reason });
    return;
  }
  if (!areSeatsFilled(payload.roomId)) {
    logOnline(sessionID, `startOnlineGame blocked roomId=${payload.roomId} reason=seats_not_filled`);
    socket.emit('onlinePinInvalid', { reason: 'seats_not_filled' });
  }
  logOnline(
    sessionID,
    `startOnlineGame compatibility signal roomId=${payload.roomId} started=${ready.started}`
  );
  if (ready.started) {
    publishOnlineMatchStarted(payload.roomId, sessionID);
  }
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
  emitOnlineRoomsList();
}

export function onlineSetReadyHandler(
  socket: Socket,
  payload: { roomId: string; ready: boolean }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (!sessionID || !room) {
    logOnline(sessionID, `onlineSetReady denied roomId=${payload.roomId}`);
    return;
  }
  const result = setSeatReady(payload.roomId, sessionID, !!payload.ready);
  if (!result.ok) {
    logOnline(sessionID, `onlineSetReady blocked roomId=${payload.roomId} reason=${result.reason}`);
    socket.emit('onlinePinInvalid', { reason: result.reason });
    return;
  }
  logOnline(
    sessionID,
    `onlineSetReady roomId=${payload.roomId} ready=${payload.ready} started=${result.started}`
  );
  if (result.started) {
    publishOnlineMatchStarted(payload.roomId, sessionID);
  }
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
  emitOnlineRoomsList();
}

export function getOnlinePostGameHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const room = getRoomById(payload.roomId);
  if (room) {
    // Refresh room membership/socket mapping on postgame entry so seat ownership
    // stays associated through reconnects and route transitions.
    joinRoom(payload.roomId, sessionID, socket.id);
    socket.join(payload.roomId);
    socket.data.currentOnlineRoomId = payload.roomId;
  }
  const info = getOnlinePostGame(payload.roomId);
  if (!info) {
    logOnline(sessionID, `getOnlinePostGame failed roomId=${payload.roomId}`);
    socket.emit('onlinePinInvalid', { reason: 'postgame_unavailable' });
    return;
  }
  logOnline(
    sessionID,
    `getOnlinePostGame roomId=${payload.roomId} winner=${info.winnerName} points=${info.winnerPoints}`
  );
  socket.emit('resOnlinePostGameInfo', info);
}

export function getOnlineReplayHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const replay = getOnlineReplay(payload.roomId);
  if (!replay) {
    logOnline(sessionID, `getOnlineReplay unavailable roomId=${payload.roomId}`);
    socket.emit('onlinePinInvalid', { reason: 'replay_unavailable' });
    return;
  }
  logOnline(
    sessionID,
    `getOnlineReplay roomId=${payload.roomId} frames=${replay.frames.length} tickMs=${replay.tickMs}`
  );
  socket.emit('resOnlineReplay', replay);
}

export async function createOnlineWithdrawalHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const info = getOnlinePostGame(payload.roomId);
  const room = getRoomById(payload.roomId);
  const winnerSeat =
    room && info?.winnerRole ? room.seats.get(info.winnerRole) : undefined;
  const isWinnerSession = Boolean(info?.winnerSessionID && info.winnerSessionID === sessionID);
  const isWinnerSocket = Boolean(winnerSeat?.socketID && winnerSeat.socketID === socket.id);
  if (!info || (!isWinnerSession && !isWinnerSocket)) {
    logOnline(sessionID, `createOnlineWithdrawal denied roomId=${payload.roomId}`);
    socket.emit('onlinePinInvalid', { reason: 'only_winner_can_withdraw' });
    return;
  }
  if (info.rematchRequested) {
    socket.emit('onlinePinInvalid', { reason: 'rematch_pending' });
    return;
  }
  if (info.lnurlw || info.payoutMethod === 'nostr_zap') {
    if (info.lnurlw) {
      socket.emit('resCreateOnlineWithdrawal', { roomId: payload.roomId, lnurlw: info.lnurlw });
      return;
    }
    socket.emit('onlinePinInvalid', { reason: 'withdraw_started' });
    return;
  }
  const amount = Math.max(0, Math.floor(info.winnerPoints * ONLINE_PAYOUT_MULTIPLIER));
  if (amount <= 0) {
    logOnline(sessionID, `createOnlineWithdrawal skipped roomId=${payload.roomId} reason=zero_amount`);
    socket.emit('resCreateOnlineWithdrawal', { roomId: payload.roomId, lnurlw: 'pass' });
    return;
  }
  const lnurlw = await createLNURLW(amount, P2PMAXWITHDRAWALS);
  if (!lnurlw) {
    logOnline(sessionID, `createOnlineWithdrawal failed roomId=${payload.roomId} reason=lnbits_error`);
    socket.emit('onlinePinInvalid', { reason: 'lnurlw_create_failed' });
    return;
  }
  setIDToLNURLW(sessionID, { id: lnurlw.id, lnurlw: lnurlw.lnurl, maxWithdrawals: 1, claimedCount: 0 });
  setLNURLWToID(lnurlw.id, sessionID);
  setOnlinePostGameLnurlw(payload.roomId, lnurlw.lnurl);
  logOnline(sessionID, `createOnlineWithdrawal success roomId=${payload.roomId} amount=${amount}`);
  const liveRoom = getRoomById(payload.roomId);
  if (liveRoom) {
    io.to(liveRoom.roomId).emit('onlineRoomUpdated', serializeRoom(liveRoom));
    const roomEmojis = liveRoom.nostrMeta?.emojis ?? '🎮🎮🎮🎮';
    void publishOnlineKind1Reply({
      sessionID,
      rootEventId: liveRoom.kind1EventId,
      content: `ONLINE ROUND CLOSED ${roomEmojis}\nWinner selected payout.\nRound closed.`,
      mentions: getSeatMentions(liveRoom.roomId),
    });
  }
  socket.emit('resCreateOnlineWithdrawal', { roomId: payload.roomId, lnurlw: lnurlw.lnurl });
}

export async function createOnlineNostrPayoutHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const info = getOnlinePostGame(payload.roomId);
  const room = getRoomById(payload.roomId);
  const winnerSeat =
    room && info?.winnerRole ? room.seats.get(info.winnerRole) : undefined;
  const isWinnerSession = Boolean(info?.winnerSessionID && info.winnerSessionID === sessionID);
  const isWinnerSocket = Boolean(winnerSeat?.socketID && winnerSeat.socketID === socket.id);
  if (!info || (!isWinnerSession && !isWinnerSocket)) {
    logOnline(sessionID, `createOnlineNostrPayout denied roomId=${payload.roomId}`);
    socket.emit('onlinePinInvalid', { reason: 'only_winner_can_withdraw' });
    return;
  }
  if (info.rematchRequested) {
    logOnline(sessionID, `createOnlineNostrPayout blocked roomId=${payload.roomId} reason=rematch_pending`);
    socket.emit('onlinePinInvalid', { reason: 'rematch_pending' });
    return;
  }
  if (info.lnurlw || info.payoutMethod === 'nostr_zap') {
    logOnline(sessionID, `createOnlineNostrPayout blocked roomId=${payload.roomId} reason=withdraw_started`);
    socket.emit('onlinePinInvalid', { reason: 'withdraw_started' });
    return;
  }
  const lnAddress = info.winnerLnAddress;
  if (!lnAddress) {
    logOnline(sessionID, `createOnlineNostrPayout blocked roomId=${payload.roomId} reason=winner_ln_missing`);
    socket.emit('onlinePinInvalid', { reason: 'winner_ln_missing' });
    return;
  }
  const amount = Math.max(0, Math.floor(info.winnerPoints * ONLINE_PAYOUT_MULTIPLIER));
  if (amount <= 0) {
    logOnline(sessionID, `createOnlineNostrPayout skipped roomId=${payload.roomId} reason=zero_amount`);
    socket.emit('onlinePinInvalid', { reason: 'zero_amount' });
    return;
  }
  try {
    await payLnAddress(lnAddress, amount);
  } catch (error) {
    logOnline(
      sessionID,
      `createOnlineNostrPayout failed roomId=${payload.roomId} ln=${lnAddress} error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
    socket.emit('onlinePinInvalid', { reason: 'nostr_payout_failed' });
    return;
  }
  setOnlinePostGameNostrPayout(payload.roomId, lnAddress);
  logOnline(sessionID, `createOnlineNostrPayout success roomId=${payload.roomId} amount=${amount} ln=${lnAddress}`);
  const liveRoom = getRoomById(payload.roomId);
  if (liveRoom) {
    io.to(liveRoom.roomId).emit('onlineRoomUpdated', serializeRoom(liveRoom));
    const roomEmojis = liveRoom.nostrMeta?.emojis ?? '🎮🎮🎮🎮';
    void publishOnlineKind1Reply({
      sessionID,
      rootEventId: liveRoom.kind1EventId,
      content: `ONLINE ROUND CLOSED ${roomEmojis}\nWinner selected payout.\nRound closed.`,
      mentions: getSeatMentions(liveRoom.roomId),
    });
  }
  socket.emit('resCreateOnlineNostrPayout', {
    roomId: payload.roomId,
    lnAddress,
    amount,
    ok: true,
  });
}

export function onlineDoubleOrNothingHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const vote = voteOnlineDoubleOrNothing(payload.roomId, sessionID);
  if (!vote.ok) {
    logOnline(sessionID, `onlineDoubleOrNothing denied roomId=${payload.roomId} reason=${vote.reason}`);
    socket.emit('onlinePinInvalid', { reason: vote.reason });
    return;
  }
  io.to(payload.roomId).emit('onlineDoubleOrNothingUpdate', {
    roomId: payload.roomId,
    votes: vote.votes,
    required: 2,
    agreed: vote.agreed,
  });
  const room = getRoomById(payload.roomId);
  if (room) {
    if (vote.agreed) {
      const winnerRole = room.postGame.winnerRole;
      const loserRole =
        winnerRole === PlayerRole.Player1 ? PlayerRole.Player2 : PlayerRole.Player1;
      const loserSeat = loserRole ? room.seats.get(loserRole) : undefined;
      const requiredAmount = Math.max(1, Math.floor(room.postGame.winnerPoints * ONLINE_PAYOUT_MULTIPLIER));
      const roomEmojis = room.nostrMeta?.emojis ?? '🎮🎮🎮🎮';
      void (async () => {
        try {
          const published = await publishOnlineRematchKind1({
            sessionID,
            rootEventId: room.kind1EventId,
            emojis: roomEmojis,
            amount: requiredAmount,
            loserPubkey: loserSeat?.pubkey,
            loserName: loserSeat?.name,
          });
          if (!published) {
            return;
          }
          setOnlineRematchRequested({
            roomId: room.roomId,
            requiredAmount,
            rematchEventId: published.eventId,
            rematchNote1: published.note1,
            waitingForSessionID: loserSeat?.sessionID,
          });
          const live = getRoomById(room.roomId);
          if (live) {
            io.to(live.roomId).emit('onlineRoomUpdated', serializeRoom(live));
          }
        } catch (error) {
          logOnline(
            sessionID,
            `onlineDoubleOrNothing rematch publish failed roomId=${room.roomId} error=${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })();
    }
    io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
    emitOnlineRoomsList();
  }
}

export function startOnlineLoop() {
  setInterval(() => {
    const rooms = listOnlineRooms();
    for (const room of rooms) {
      if (room.phase !== 'playing') {
        continue;
      }
      stepRoomSnapshot(room.roomId);
      const live = getRoomById(room.roomId);
      if (live) {
        io.to(room.roomId).emit('onlineRoomSnapshot', {
          roomId: live.roomId,
          snapshot: live.snapshot,
        });
        if (live.phase !== room.phase) {
          const roomEmojis = live.nostrMeta?.emojis ?? '🎮🎮🎮🎮';
          if (room.phase === 'playing' && live.phase === 'finished') {
            const winnerName = live.postGame.winnerName || live.snapshot.state.winnerName || 'Unknown winner';
            const winnerSeat = [...live.seats.values()].find(
              (seat) => seat.status === 'paid' && seat.sessionID === live.postGame.winnerSessionID
            );
            const netPrize = Math.max(
              0,
              Math.floor((live.postGame.totalPrize ?? 0) * ONLINE_PAYOUT_MULTIPLIER)
            );
            void publishOnlineKind1Reply({
              sessionID: live.hostSessionID,
              rootEventId: live.kind1EventId,
              content: `ONLINE MATCH RESULT ${roomEmojis}\nWinner: ${winnerName}.\nFinal score: ${live.snapshot.state.p1Name} ${live.snapshot.state.score[0]} - ${live.snapshot.state.p2Name} ${live.snapshot.state.score[1]}.\nNet prize after fee: ${netPrize} sats.`,
              mentions: [
                { pubkey: winnerSeat?.pubkey, name: winnerName },
                ...getSeatMentions(live.roomId),
              ],
            });
          }
          emitOnlineRoomsList();
        }
      }
    }
  }, ONLINE_TICK_MS);
}

async function payLnAddress(lnAddress: string, satsAmount: number) {
  const [userLN, domainLN] = lnAddress.split('@');
  if (!userLN || !domainLN) {
    throw new Error('invalid_ln_address');
  }
  const lnurl = `https://${domainLN}/.well-known/lnurlp/${userLN}`;
  const callback = await getLNURLCallback(lnurl);
  const invoice = await getInvoiceFromCallback(callback, satsAmount);
  await payInvoice(invoice);
}
