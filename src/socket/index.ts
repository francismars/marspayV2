import { Server, Socket } from 'socket.io';
import middleware from './middleware';
import { dateNow } from '../utils/time';
import { getP2PMenuInfos } from './P2PMenu';
import { gameFinished, gameInfos } from './game';
import { createWithdrawalPostGame, postGameInfo } from './postGame';

export default function registerSocketHandlers(io: Server) {
  io.use((socket: Socket, next) => {
    middleware(io, socket, next);
  });

  io.on('connection', (socket: Socket) => {
    const realIP = socket.handshake.address; // TODO: change when NGINX is set up
    console.log(
      `${dateNow()} [${socket.data.sessionID}] connected with IP ${realIP}.`
    );

    // TODO: Change to getP2PMenuInfos
    socket.on('getGameMenuInfos', async () => {
      getP2PMenuInfos(socket);
    });

    // TODO: Change to getGameInfos
    socket.on('getDuelInfos', () => {
      gameInfos(socket);
    });

    socket.on('gameFinished', async (winnerP) => {
      gameFinished(socket, winnerP);
    });

    socket.on('postGameInfoRequest', () => {
      postGameInfo(socket);
    });

    socket.on('createWithdrawalPostGame', async () => {
      createWithdrawalPostGame(socket);
    });

    socket.on('disconnect', () => {
      console.log(`${dateNow()} [${socket.data.sessionID}] Disconnected.`);
    });
  });
}
