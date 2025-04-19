import { DefaultEventsMap, Server, Socket } from 'socket.io';
import middleware from './middleware';
import { dateNow } from '../utils/time';
import { getP2PMenuInfos } from './P2PMenu';
import { gameFinished, gameInfos } from './game';
import { createWithdrawalPostGame, postGameInfo } from './postGame';
import { cancelP2P } from './cancelP2P';
import { getPracticeMenuInfos } from './practiceMenu';
import { normalizeIP } from '../utils/ip';
import { getTournamentMenuInfos } from './tournament';

export default function registerSocketHandlers(io: Server) {
  io.use((socket: Socket, next) => {
    middleware(io, socket, next);
  });

  io.on('connection', (socket: Socket) => {
    const realIP = normalizeIP(socket.handshake.address); // TODO: change when NGINX is set up
    console.log(
      `${dateNow()} [${socket.data.sessionID}] connected with IP ${realIP}.`
    );

    // TODO: Change to getP2PMenuInfos
    socket.on('getGameMenuInfos', async () => {
      await getP2PMenuInfos(socket);
    });

    socket.on('cancelp2p', () => {
      cancelP2P(socket);
    });

    // TODO: Change to getGameInfos
    socket.on('getDuelInfos', () => {
      gameInfos(socket);
    });

    socket.on('getPracticeMenuInfos', async () => {
      await getPracticeMenuInfos(socket);
    });

    socket.on(
      'getTournamentInfos',
      async (data?: { buyin: number; players: number }) => {
        await getTournamentMenuInfos(socket, data);
      }
    );

    socket.on('gameFinished', async (winnerP) => {
      gameFinished(socket, winnerP);
    });

    socket.on('postGameInfoRequest', () => {
      postGameInfo(socket);
    });

    socket.on('createWithdrawalPostGame', async () => {
      await createWithdrawalPostGame(socket);
    });

    socket.on('disconnect', () => {
      console.log(`${dateNow()} [${socket.data.sessionID}] Disconnected.`);
    });
  });
}
