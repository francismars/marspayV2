import { Socket } from 'socket.io';
import { deleteLNURLPsFromSession } from '../state/lnurlpState';
import { dateNow } from '../utils/time';
import { setIDToSocket } from '../state/sessionState';
import { deleteKind1sFromSession } from '../state/nostrState';

export function cancelP2P(socket: Socket) {
  const sessionID = socket.data.sessionID;
  console.log(`${dateNow()} [${sessionID}] Canceling P2P game.`);
  deleteLNURLPsFromSession(sessionID);
  deleteKind1sFromSession(sessionID);
  // Client usually stays on this socket after cancel (navigate to another mode).
  // Do NOT remove IDToSocket — that broke LNURL payment webhooks until reconnect.
  // Re-bind the live socket so sessionID → socket.id stays consistent.
  if (sessionID) {
    setIDToSocket(sessionID, {
      socketID: socket.id,
      lastSeen: Date.now(),
    });
  }
}
