import { Socket } from 'socket.io';
import {
  appendWinnerToGameInfo,
  getGameInfoFromID,
  serializeGameInfoFromID,
  setValueToGameInfoFromID,
} from './sessionManager';
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
    console.log('winner:', winnerP);
    console.log('loser:', loserP);
    console.log('winnerValue:', winnerValue);
    console.log('loserValue:', loserValue);
    setValueToGameInfoFromID(
      socket.data.sessionID,
      winnerP,
      Math.floor((winnerValue! + loserValue!) * 0.95)
    );
    setValueToGameInfoFromID(socket.data.sessionID, loserP, 0);
  }
}

export function postGame(socket: Socket) {
  console.log(
    `${dateNow()} [${
      socket.data.sessionID
    }] Requested P2P postGame information.`
  );
  const gameInfos = getGameInfoFromID(socket.data.sessionID);
  console.log(getGameInfoFromID(socket.data.sessionID));
  if (gameInfos && gameInfos.winners) {
    console.log(
      `${dateNow()} [${socket.data.sessionID}] Sending P2P postGame info.`
    );
    const response = serializeGameInfoFromID(socket.data.sessionID);
    socket.emit('resPostGameInfoRequest', response);
  } else
    console.log(
      `${dateNow()} [${socket.data.sessionID}] has no associated postGame info.`
    );
}

export function getOpponent(role: PlayerRole): PlayerRole {
  return role === PlayerRole.Player1 ? PlayerRole.Player2 : PlayerRole.Player1;
}
