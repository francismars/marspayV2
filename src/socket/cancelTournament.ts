import { Socket } from 'socket.io';
import { deleteGameInfoByID, getGameInfoFromID } from '../state/gameState';
import { dateNow } from '../utils/time';
import {
  deleteLNURLPsFromSession,
  getLNURLPsFromID,
} from '../state/lnurlpState';
import createLNURLW from '../calls/LNBits/createLNURLW';
import { setIDToLNURLW, setLNURLWToID } from '../state/lnurlwState';
import { deleteSocketFromSession } from '../state/sessionState';

export async function cancelTournament(socket: Socket) {
  const sessionID = socket.data.sessionID;
  console.log(`dateNow() [${sessionID}] Attempting to cancel tournament.`);
  const response: {
    depositcount: number;
    lnurlw?: string;
  } = { depositcount: 0 };
  const tournamentInfo = getGameInfoFromID(sessionID);
  if (!tournamentInfo) {
    console.log(`${dateNow()} [${sessionID}] No tournament information found.`);
    return;
  }
  if (tournamentInfo.players) {
    const depositcount = tournamentInfo.players.size;
    console.log(
      `${dateNow()} [${sessionID}] Found an ongoing tournament with ${depositcount} deposits.`
    );
    const players = tournamentInfo.players;
    response.depositcount = depositcount;
    if (depositcount > 0) {
      const lastLNURLPtournament = getLNURLPsFromID(sessionID);
      if (
        lastLNURLPtournament &&
        lastLNURLPtournament[0].mode == 'TOURNAMENT'
      ) {
        const amount = lastLNURLPtournament[0].min;
        console.log(
          `${dateNow()} [${sessionID}] Creating LNRURLw with ${amount} sats and ${depositcount} uses.`
        );
        let lnurlw = await createLNURLW(
          Math.floor(amount * 0.95),
          depositcount
        );
        if (lnurlw) {
          console.log(
            `${dateNow()} [${sessionID}] Created LNURLw ${lnurlw.id}.`
          );
          setIDToLNURLW(sessionID, {
            id: lnurlw.id,
            lnurlw: lnurlw.lnurl,
            maxWithdrawals: depositcount,
            claimedCount: 0,
          });
          setLNURLWToID(lnurlw.id, sessionID);
          response.lnurlw = lnurlw.lnurl;
        }
      }
    } else if (depositcount == 0) {
      deleteLNURLPsFromSession(sessionID);
      deleteGameInfoByID(sessionID);
      deleteSocketFromSession(sessionID);
    }
  }
  console.log(
    `${dateNow()} [${sessionID}] Sending cancel tournament information.`
  );
  socket.emit('rescanceltourn', response);
}
