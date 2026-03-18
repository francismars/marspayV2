import { Socket } from 'socket.io';
import { publishGameKind1 } from '../calls/NDK/publishGameKind1';
import { setNDKInstance } from '../calls/NDK/setNDKInstance';
import { GameMode } from '../types/game';
import { io } from '../server';
import { getKind1sfromSessionID } from '../state/nostrState';
import {
  areSeatsFilled,
  createOnlineRoom,
  deleteRoom,
  getRoomByCode,
  getRoomById,
  isPaidSeatSession,
  issueJoinPin,
  joinRoom,
  leaveRoom,
  listOnlineRooms,
  serializeRoom,
  setRoomNostrMeta,
  setRoomPhase,
  stepRoomSnapshot,
  updateRoomInput,
} from '../state/onlineRoomState';

const ONLINE_TICK_MS = 100;

export async function createOnlineRoomHandler(
  socket: Socket,
  payload?: { buyin?: number; hostLNAddress?: string }
) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const room = createOnlineRoom({
    hostSessionID: sessionID,
    hostSocketID: socket.id,
    buyin: payload?.buyin,
  });

  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  const pin = issueJoinPin(room.roomId, sessionID, socket.id);
  const roomState = serializeRoom(room);
  io.to(room.roomId).emit('onlineRoomUpdated', roomState);
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
      await setNDKInstance();
      await publishGameKind1(sessionID, {
        mode: GameMode.ONLINE,
        buyin: room.buyin,
        hostLNAddress: payload?.hostLNAddress,
        numberOfPlayers: 2,
        roomCode: room.roomCode,
      });
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
      }
    } catch (error) {
      console.error(`Failed to publish ONLINE room kind1 ${room.roomId}:`, error);
    }
  })();
}

export function listOnlineRoomsHandler(socket: Socket) {
  socket.emit('resListOnlineRooms', {
    rooms: listOnlineRooms(),
  });
}

export function joinOnlineRoomHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  if (!sessionID) {
    return;
  }
  const room = joinRoom(payload.roomId, sessionID, socket.id);
  if (!room) {
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  const pin = issueJoinPin(room.roomId, sessionID, socket.id);
  const roomState = serializeRoom(room);
  io.to(room.roomId).emit('onlineRoomUpdated', roomState);
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
  const room = getRoomByCode(payload.roomCode);
  if (!room) {
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
  const room = joinRoom(payload.roomId, sessionID, socket.id);
  if (!room) {
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  socket.join(room.roomId);
  socket.data.currentOnlineRoomId = room.roomId;
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
}

export function getOnlineRoomStateHandler(socket: Socket, payload: { roomId: string }) {
  const room = getRoomById(payload.roomId);
  if (!room) {
    socket.emit('onlinePinInvalid', { reason: 'room_not_found' });
    return;
  }
  socket.emit('onlineRoomUpdated', serializeRoom(room));
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
  leaveRoom(sessionID);
}

export function cancelOnlineRoomHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (!sessionID || !room || room.hostSessionID !== sessionID) {
    return;
  }
  setRoomPhase(room.roomId, 'cancelled');
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
  deleteRoom(room.roomId);
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
  if (!room || room.phase !== 'playing' || !isPaidSeatSession(payload.roomId, sessionID)) {
    return;
  }
  updateRoomInput(payload.roomId, sessionID, payload.input);
}

export function startOnlineGameHandler(socket: Socket, payload: { roomId: string }) {
  const sessionID = socket.data.sessionID as string | undefined;
  const room = getRoomById(payload.roomId);
  if (!sessionID || !room || room.hostSessionID !== sessionID) {
    return;
  }
  if (!areSeatsFilled(payload.roomId)) {
    socket.emit('onlinePinInvalid', { reason: 'seats_not_filled' });
    return;
  }
  setRoomPhase(payload.roomId, 'playing');
  io.to(room.roomId).emit('onlineRoomUpdated', serializeRoom(room));
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
      }
    }
  }, ONLINE_TICK_MS);
}
