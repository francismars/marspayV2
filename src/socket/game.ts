import { Socket } from 'socket.io';
import {
  appendWinnerToGameInfo,
  getGameInfoFromID,
  serializeGameInfoFromID,
  setValueToGameInfoFromID,
} from '../manager/gameManager';
import { dateNow } from '../utils/time';
import { PlayerRole } from '../types/game';

export function gameInfos(socket: Socket) {
  const gameInfo = getGameInfoFromID(socket.data.sessionID);
  if (gameInfo) {
    console.log(
      `${dateNow()} [${
        socket.data.sessionID
      }] Requested P2P information for game.`
    );
    console.log(
      `${dateNow()} [${socket.data.sessionID}] Sending game P2P information.`
    );
    socket.emit(
      'resGetDuelInfos',
      serializeGameInfoFromID(socket.data.sessionID)
    );
  }
}

export function gameFinished(socket: Socket, winnerP: PlayerRole) {
  console.log(
    `${dateNow()} [${
      socket.data.sessionID
    }] Game is finished. Winner is ${winnerP}.`
  );
  const gameInfo = getGameInfoFromID(socket.data.sessionID);
  if (gameInfo) {
    appendWinnerToGameInfo(socket.data.sessionID, winnerP);
    const loserP = getOpponent(winnerP);
    const winnerValue = gameInfo.players.get(winnerP)?.value;
    const loserValue = gameInfo.players.get(loserP)?.value;
    setValueToGameInfoFromID(
      socket.data.sessionID,
      winnerP,
      Math.floor((winnerValue! + loserValue!) * 0.95)
    );
    setValueToGameInfoFromID(socket.data.sessionID, loserP, 0);
  }
}

export function getOpponent(role: PlayerRole): PlayerRole {
  return role === PlayerRole.Player1 ? PlayerRole.Player2 : PlayerRole.Player1;
}
