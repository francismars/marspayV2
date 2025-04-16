import { Server, Socket } from 'socket.io';
import { getSocketFromID, setIDToSocket } from '../state/sessionState';
import { ALLOWEDEMOJIS } from '../consts/emojis';
import { customAlphabet } from 'nanoid';
import { nolookalikes } from 'nanoid-dictionary';
import { dateNow } from '../utils/time';

export default function middleware(io: Server, socket: Socket, next: any) {
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const socketID = getSocketFromID(sessionID);
    if (socketID) {
      console.log(
        `${dateNow()} [${sessionID}] Found sessionID sent by client.`
      );
      socket.data.sessionID = sessionID;
      setIDToSocket(sessionID, socket.id);
      return next();
    }
  }
  const emoji = ALLOWEDEMOJIS[Math.floor(Math.random() * ALLOWEDEMOJIS.length)];
  const stringID = customAlphabet(nolookalikes, 11);
  socket.data.sessionID = `${emoji}:${stringID()}`;
  setIDToSocket(socket.data.sessionID, socket.id);
  console.log(
    `${dateNow()} [${socket.data.sessionID}] Created new sessionID for client.`
  );
  socket.emit('session', {
    sessionID: socket.data.sessionID,
  });
  return next();
}
