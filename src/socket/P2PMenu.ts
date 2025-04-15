import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getLNURLWFromID, getLNURLPsFromID } from '../manager/lnurlManager';
import {
  getGameInfoFromID,
  serializeGameInfoFromID,
} from '../manager/gameManager';
import { BUYINMAX, BUYINMIN, BUYINMINWINNER } from '../consts/values';
import { appendLNURLPToID, setLNURLPToID } from '../manager/lnurlManager';
import { PlayerRole } from '../types/game';
import { createLNURLP } from '../calls/lnurlp';

export async function getP2PMenuInfos(socket: Socket) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Requested necessary informations for Game Menu.`
  );
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

async function newLNURLPsP2P(
  sessionID: string,
  previousWinner: PlayerRole | null = null
): Promise<void> {
  const playersDescriptions = ['Player 1', 'Player 2'];
  for (const description of playersDescriptions) {
    const reqInDescription = description;
    const buyInMax = BUYINMAX;
    const buyInMin = BUYINMIN;
    if (previousWinner) {
      //description == previousWinner ? buyInMin = BUYINMINWINNER : buyInMin = app.sessionidsGameInfo[sessionID][previousWinner].value
    }
    console.log(
      `${dateNow()} [${sessionID}] Requesting new LNURLp with description ${reqInDescription} from ${buyInMin} to ${buyInMax} sats.`
    );
    const lnurlinfo = await createLNURLP(description, buyInMin, buyInMax);
    if (!lnurlinfo) {
      console.log(
        `${dateNow()} [${sessionID}] It wasn't possible to create LNURLp.`
      );
      return;
    }
    console.log(`${dateNow()} [${sessionID}] Created LNURLp ${lnurlinfo.id}.`);
    setLNURLPToID(lnurlinfo.id, sessionID);
    lnurlinfo['mode'] = 'P2P';
    appendLNURLPToID(sessionID, lnurlinfo);
  }
}
