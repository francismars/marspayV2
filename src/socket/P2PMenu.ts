import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import {
  getLNURLWFromID,
  getLNURLPsFromID,
  getGameInfoFromID,
  getSocketFromID,
  serializeGameInfoFromID,
} from './sessionManager';
import { newLNURLPsP2P } from '../lnurl';

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
      /*
      const lnurlpCount = LNURLPs.length;
      if (LNURLPs.length === 2) {
        const gameInfo = getGameInfoFromID(sessionID);
        if (gameInfo) {
          console.log(
            dateNow() +
              " [" +
              sessionID +
              "] Previous deposits found. Sending existing information."
          );
          socket.emit("updatePayments", gameInfo);

          if (gameInfo.winners) {
            console.log(
              dateNow() +
                " [" +
                sessionID +
                "] Winners from previous games found."
            );
            let winnerList = gameInfo.winners;
            previousWinner = winnerList.slice(-1);
            winnersListLength = winnerList.length;
          }
          if (
            !previousWinner ||
            (previousWinner && lnurlpCount > winnersListLength * 2)
          ) {
            console.log(
              dateNow() +
                " [" +
                sessionID +
                "] LNRURLPs found. Sending existing ones."
            );
          } else if (previousWinner && lnurlpCount <= winnersListLength * 2) {
            console.log(
              dateNow() +
                " [" +
                sessionID +
                "] Found " +
                lnurlpCount +
                " LNRURLPs but requires more than " +
                winnersListLength * 2 +
                ". Creating new ones."
            );
            await newLNURLPsP2P(sessionID, previousWinner);
          }
        }
        
      }
    */
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
