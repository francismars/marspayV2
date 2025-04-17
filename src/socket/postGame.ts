import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getGameInfoFromID, serializeGameInfoFromID } from '../state/gameState';
import {
  getLNURLWFromID,
  setIDToLNURLW,
  setLNURLWToID,
} from '../state/lnurlwState';
import { GameMode, PlayerRole } from '../types/game';
import createLNURLW from '../calls/LNBits/createLNURLW';
import { P2PMAXWITHDRAWALS } from '../consts/values';

export function postGameInfo(socket: Socket) {
  const sessionID = socket.data.sessionID;
  console.log(
    `${dateNow()} [${sessionID}] Requested P2P postGame information.`
  );
  const gameInfos = getGameInfoFromID(sessionID);
  if (gameInfos && gameInfos.winners) {
    console.log(`${dateNow()} [${sessionID}] Sending P2P postGame info.`);
    const response = serializeGameInfoFromID(sessionID);
    socket.emit('resPostGameInfoRequest', response);
  } else
    console.log(`${dateNow()} [${sessionID}] has no associated postGame info.`);
}

export async function createWithdrawalPostGame(socket: Socket) {
  const sessionID = socket.data.sessionID;
  console.log(`${dateNow()} [${sessionID}] Requested LNRURLw.`);
  const LNURLW = getLNURLWFromID(sessionID);
  if (LNURLW) {
    console.log(`${dateNow()} [${sessionID}] Sending existing LNRURLw.`);
    socket.emit('resCreateWithdrawalPostGame', LNURLW);
  } else if (!LNURLW) {
    console.log(`${dateNow()} [${sessionID}] No associated LNRURLw.`);
    const gameInfo = getGameInfoFromID(sessionID);
    if (!gameInfo) {
      console.log(
        `${dateNow()} [${sessionID}] Tried to create withdrawal link but didn't make any deposits`
      );
      return;
    }
    if (!gameInfo?.winners) {
      console.log(
        `${dateNow()} [${sessionID}] Tried to create withdrawal link but there are no winners`
      );
      return;
    }
    const winner: PlayerRole = gameInfo!.winners!.slice(-1)[0];
    const valueFrom =
      gameInfo.gamemode == GameMode.P2P ? winner : PlayerRole.Player1;
    const amount = gameInfo!.players!.get(valueFrom)!.value;
    if (amount == 0) {
      console.log(
        `${dateNow()} [${sessionID}] Requested to create LNURLW with 0 sats. Deleting Session data.`
      );
      socket.emit('resCreateWithdrawalPostGame', 'pass');
      //deleteSessionData(sessionid);
    } else if (amount > 0) {
      const maxWithdrawals = P2PMAXWITHDRAWALS;
      console.log(
        `${dateNow()} [${sessionID}] Creating LNRURLw with ${amount} sats and ${maxWithdrawals} uses.`
      );
      const lnurlw = await createLNURLW(Math.floor(amount), maxWithdrawals);
      if (lnurlw) {
        console.log(`${dateNow()} [${sessionID}] Created LNURLw ${lnurlw.id}.`);
        setIDToLNURLW(sessionID, { id: lnurlw.id, lnurlw: lnurlw.lnurl });
        setLNURLWToID(lnurlw.id, sessionID);
        socket.emit('resCreateWithdrawalPostGame', lnurlw.lnurl);
      }
    }
  }
}
