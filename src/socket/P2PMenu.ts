import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getLNURLWFromID, getLNURLPsFromID } from '../manager/lnurlManager';
import {
  getGameInfoFromID,
  serializeGameInfoFromID,
} from '../manager/gameManager';
import { newLNURLPsP2P } from '../lnurlp';

export async function getP2PMenuInfos(socket: Socket) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Requested necessary informations for Game Menu.`
  );
  let previousWinner;
  let winnersListLength;
  const LNURW = getLNURLWFromID(sessionID);
  if (!LNURW) {
    const LNURLPs = getLNURLPsFromID(sessionID);
    if (!LNURLPs) {
      console.log(
        `${dateNow()} [${sessionID}] There are no associated LNRURLPs. Creating new ones.`
      );
      await newLNURLPsP2P(sessionID);
    } else if (LNURLPs) {
      console.log(`${dateNow()} [${sessionID}] Found existing LNRURLPs.`);
    }
    console.log(`${dateNow()} [${sessionID}] Sending LNRURLPs to client.`);
    socket.emit('resGetGameMenuInfos', getLNURLPsFromID(sessionID));
    const gameInfo = getGameInfoFromID(sessionID);
    if (gameInfo) {
      socket.emit('updatePayments', serializeGameInfoFromID(sessionID));
    }
  } else if (LNURW) {
    console.log(`${dateNow()} [${sessionID}] Found associated LNURLW.`);
    const response = { lnurlw: LNURW };
    socket.emit('resGetGameMenuInfos', response);
  }
}
