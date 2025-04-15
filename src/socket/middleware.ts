import { Server, Socket } from 'socket.io';
import { getSocketFromID, setIDToSocket } from '../state/sessionState';
import { ALLOWEDEMOJIS } from '../consts/emojis';
import { v4 as uuidv4 } from 'uuid';
import { dateNow } from '../utils/time';

export default function middleware(io: Server) {
  io.use((socket: Socket, next) => {
    console.log('🔌 Middleware ran for socket:', socket.id);
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
    const emoji =
      ALLOWEDEMOJIS[Math.floor(Math.random() * ALLOWEDEMOJIS.length)];
    socket.data.sessionID = `${emoji}:${uuidv4()}`;
    setIDToSocket(socket.data.sessionID, socket.id);
    console.log(
      `${dateNow()} [${
        socket.data.sessionID
      }] Created new sessionID for client.`
    );
    socket.emit('session', {
      sessionID: socket.data.sessionID,
    });
    return next();
  });
}
