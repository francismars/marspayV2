import { ExtendedError, Server, Socket } from 'socket.io';
import { getSocketFromID, setIDToSocket } from '../state/sessionState';
import { ALLOWEDEMOJIS } from '../consts/emojis';
import { customAlphabet } from 'nanoid';
import { nolookalikes } from 'nanoid-dictionary';
import { dateNow } from '../utils/time';
import { SESSIONIDLENGHT } from '../consts/values';
import { Session } from '../types/session';
import { normalizeIP } from '../utils/ip';

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
  const validID = sanitiseID(sessionID);
  if (sessionID && validID) {
    console.error(
      `${dateNow()} [${sessionID}] Existing sessionID sent by client.`
    );
    const socketID = getSocketFromID(sessionID);
    if (socketID) {
      socket.data.sessionID = sessionID;
      setIDToSocket(sessionID, session);
      return next();
    }
  }
  const emoji = ALLOWEDEMOJIS[Math.floor(Math.random() * ALLOWEDEMOJIS.length)];
  const newID = customAlphabet(nolookalikes, SESSIONIDLENGHT);
  socket.data.sessionID = `${emoji}:${newID()}`;
  const realIP = socket.handshake.headers['x-real-ip']; //normalizeIP()
  console.log(
    `${dateNow()} [${
      socket.data.sessionID
    }] Created new sessionID for ${realIP}.`
  );
  setIDToSocket(socket.data.sessionID, session);
  socket.emit('session', {
    sessionID: socket.data.sessionID,
  });
  return next();
}

function sanitiseID(id: string) {
  if (!id || id == '' || id.split(':').length !== 2) {
    console.error(`${dateNow()} [${id}] ID not valid.`);
    return false;
  }
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
