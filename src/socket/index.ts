import { Server, Socket } from 'socket.io';
import middleware from './middleware';
import { dateNow } from '../utils/time';
import { getP2PMenuInfos } from './P2PMenu';
import { gameFinished, gameInfos } from './game';
import { createWithdrawalPostGame, postGameInfo } from './postGame';
import { cancelP2P } from './cancelP2P';
import { getPracticeMenuInfos } from './practiceMenu';
import { getTournamentMenuInfos } from './tournament';
import { cancelTournament } from './cancelTournament';
import { getNostrP2PMenuInfos } from './nostrP2PMenu';

export default function registerSocketHandlers(io: Server) {
  io.use((socket: Socket, next) => {
    middleware(io, socket, next);
  });

  io.on('connection', (socket: Socket) => {
    // TODO: Change to getP2PMenuInfos
    socket.on('getGameMenuInfos', async (hostInfo?: { LNAddress: string }) => {
      const hostLNAddress = hostInfo && hostInfo.LNAddress ?  hostInfo.LNAddress : undefined
      await getP2PMenuInfos(socket, hostLNAddress);
    });

    socket.on('getPracticeMenuInfos', async (hostInfo?: { LNAddress: string }) => {
      const hostLNAddress = hostInfo && hostInfo.LNAddress ?  hostInfo.LNAddress : undefined
      await getPracticeMenuInfos(socket, hostLNAddress);
    });

    socket.on('getGameMenuInfosNostr', async (hostInfo?: { LNAddress: string }) => {
      const hostLNAddress = hostInfo && hostInfo.LNAddress ?  hostInfo.LNAddress : undefined
      await getNostrP2PMenuInfos(socket, hostLNAddress);
    });

    socket.on('cancelp2p', () => {
      cancelP2P(socket);
    });

    socket.on(
      'getTournamentInfos',
      async (data?: { buyin: number; players: number; hostLNAddress?: string }) => {
        await getTournamentMenuInfos(socket, data);
      }
    );

    socket.on('canceltournament', async () => {
      await cancelTournament(socket);
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
      await createWithdrawalPostGame(socket);
    });

    socket.on('disconnect', () => {});
  });
}
