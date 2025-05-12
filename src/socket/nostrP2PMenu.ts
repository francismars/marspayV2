import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getLNURLWFromID } from '../state/lnurlwState';
import { serializeGameInfoFromID } from '../state/gameState';
import { getKind1sfromSessionID } from '../state/nostrState';
import { deleteLNURLPsFromSession } from '../state/lnurlpState';
import { setNDKInstance } from '../calls/NDK/setNDKInstance';
import { publishGameKind1 } from '../calls/NDK/publishGameKind1';

export async function getNostrP2PMenuInfos(socket: Socket, LNAddress?: string) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  deleteLNURLPsFromSession(sessionID);
  console.log(
    `${dateNow()} [${sessionID}] Requested necessary informations for Nostr Game Menu.`
  );
  const LNURW = getLNURLWFromID(sessionID);
  if (LNURW) {
    console.log(`${dateNow()} [${sessionID}] Found associated LNURLW.`);
    socket.emit('resGetGameMenuInfos', { lnurlw: LNURW });
    return;
  }
  const gameInfo = serializeGameInfoFromID(sessionID);
  const note1s = getKind1sfromSessionID(sessionID);
  if (note1s) {
    console.log(`${dateNow()} [${sessionID}] Found associated Nostr Event.`);
    if (!gameInfo) {
      socket.emit('resGetGameMenuInfos', note1s);
      return;
    }
    if (gameInfo) {
      if (!gameInfo.winners || note1s.length > gameInfo.winners.length) {
        socket.emit('resGetGameMenuInfos', note1s);
        console.log(
          `${dateNow()} [${sessionID}] Previous deposits found. Sending existing information.`
        );
        socket.emit('updatePayments', gameInfo);
        return;
      } else if (note1s.length === gameInfo.winners.length) {
        console.log(
          `${dateNow()} [${sessionID}] Double or Nothing x${
            2 ** gameInfo.winners.length
          }.`
        );
        socket.emit('updatePayments', gameInfo);
      }
    }
  }
  await setNDKInstance();
  await publishGameKind1(sessionID, LNAddress);
  const kind1 = getKind1sfromSessionID(sessionID);
  socket.emit('resGetGameMenuInfos', kind1);
}
