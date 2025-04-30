import { Socket } from 'socket.io';
import { deleteLNURLPsFromSession } from '../state/lnurlpState';
import { dateNow } from '../utils/time';
import { deleteSocketFromSession } from '../state/sessionState';
import { deleteKind1sFromSession } from '../state/nostrState';

export function cancelP2P(socket: Socket) {
  const sessionID = socket.data.sessionID;
  console.log(`${dateNow()} [${sessionID}] Canceling P2P game.`);
  deleteLNURLPsFromSession(sessionID);
  deleteKind1sFromSession(sessionID);
  deleteSocketFromSession(sessionID);
}
