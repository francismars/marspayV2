import { ExtendedError, Server, Socket } from 'socket.io';
import { getSocketFromID, setIDToSocket } from '../state/sessionState';
import { ALLOWEDEMOJIS } from '../consts/emojis';
import { customAlphabet } from 'nanoid';
import { nolookalikes } from 'nanoid-dictionary';
import { dateNow } from '../utils/time';
import { SESSIONIDLENGHT } from '../consts/values';
import { Session } from '../types/session';

export default function middleware(
  io: Server,
  socket: Socket,
  next: (err?: ExtendedError) => void
) {
  const sessionID = socket.handshake.auth.sessionID;
  const session: Session = {
    socketID: socket.id,
    lastSeen: Date.now(),
  };
  if (sessionID) {
    const validID = sanitiseID(sessionID);
    if (!validID) {
      console.error(
        `${dateNow()} [${sessionID}] Invalid sessionID sent by client.`
      );
      return next(new Error('Invalid sessionID'));
    }
    const socketID = getSocketFromID(sessionID);
    if (socketID) {
      console.log(
        `${dateNow()} [${sessionID}] Found sessionID sent by client.`
      );
      socket.data.sessionID = sessionID;
      setIDToSocket(sessionID, session);
      return next();
    }
  }
  const emoji = ALLOWEDEMOJIS[Math.floor(Math.random() * ALLOWEDEMOJIS.length)];
  const newID = customAlphabet(nolookalikes, SESSIONIDLENGHT);
  socket.data.sessionID = `${emoji}:${newID()}`;
  setIDToSocket(socket.data.sessionID, session);
  console.log(
    `${dateNow()} [${socket.data.sessionID}] Created new sessionID for client.`
  );
  socket.emit('session', {
    sessionID: socket.data.sessionID,
  });
  return next();
}

function sanitiseID(id: string) {
  const emoji = id.split(':')[0];
  const stringID = id.split(':')[1];
  if (!ALLOWEDEMOJIS.includes(emoji)) {
    console.error(`${dateNow()} [${id}] Invalid emoji in sessionID.`);
    return false;
  }
  if (stringID.length !== SESSIONIDLENGHT) {
    console.error(`${dateNow()} [${id}] Invalid sessionID length.`);
    return false;
  }
  return true;
}
