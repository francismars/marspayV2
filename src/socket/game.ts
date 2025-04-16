import { Socket } from 'socket.io';
import {
  appendWinnerToGameInfo,
  getGameInfoFromID,
  serializeGameInfoFromID,
  setValueToGameInfoFromID,
} from '../state/gameState';
import { dateNow } from '../utils/time';
import { PlayerRole } from '../types/game';
import { deleteLNURLPsFromSession } from '../state/lnurlpState';

export function gameInfos(socket: Socket) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  const gameInfo = getGameInfoFromID(sessionID);
  if (!gameInfo) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Requested information for P2P game.`
  );
  console.log(`${dateNow()} [${sessionID}] Sending game P2P information.`);
  socket.emit('resGetDuelInfos', serializeGameInfoFromID(sessionID));
}

export function gameFinished(socket: Socket, winnerP: PlayerRole) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  const gameInfo = getGameInfoFromID(sessionID);
  if (!gameInfo) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Game is finished. Winner is ${winnerP}.`
  );
  const loserP = getOpponent(winnerP);
  const winnerValue = gameInfo.players.get(winnerP)?.value;
  const loserValue = gameInfo.players.get(loserP)?.value;
  const newWinnerValue =
    winnerValue && loserValue
      ? Math.floor((winnerValue + loserValue) * 0.95)
      : undefined;
  if (!newWinnerValue) {
    console.error(
      `${dateNow()} [${sessionID}] Error calculating new winner value.`
    );
    return;
  }
  appendWinnerToGameInfo(sessionID, winnerP);
  setValueToGameInfoFromID(sessionID, winnerP, newWinnerValue);
  setValueToGameInfoFromID(sessionID, loserP, 0);
  console.log(`${dateNow()} [${sessionID}] Deleting LNURLPs from Session.`);
  deleteLNURLPsFromSession(sessionID);
}

export function getOpponent(role: PlayerRole): PlayerRole {
  return role === PlayerRole.Player1 ? PlayerRole.Player2 : PlayerRole.Player1;
}
