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
import { getTournamentNostrInfos } from './nostrTournament';
import { startMempoolBlockWatcher } from '../state/mempoolBlockWatcher';
import {
  cancelOnlineRoomHandler,
  createOnlineNostrPayoutHandler,
  createOnlineWithdrawalHandler,
  createOnlineRoomHandler,
  getOnlineRoomStateHandler,
  getOnlinePostGameHandler,
  getOnlineReplayHandler,
  joinOnlineRoomByCodeHandler,
  joinOnlineRoomHandler,
  leaveOnlineRoomHandler,
  listOnlineRoomsHandler,
  listOnlineArchivedRoomsHandler,
  listOnlineHistoryHandler,
  onlineDoubleOrNothingHandler,
  onlineSetReadyHandler,
  requestOnlineNostrLinkChallengeHandler,
  confirmOnlineNostrLinkHandler,
  requestOnlineKind1PostHandler,
  requestOnlineSeatZapPayPrepareHandler,
  confirmOnlineSeatZapPayHandler,
  requestOnlineSeatLightningHandler,
  cancelOnlineSeatLightningHandler,
  roomInputHandler,
  spectateOnlineRoomHandler,
  startOnlineGameHandler,
  startOnlineLoop,
  pingLatencyHandler,
  reportOnlineRoomPingHandler,
} from './onlineRoom';
import { leaveRoom } from '../state/onlineRoomState';
import {
  clearAppNostrSessionHandler,
  confirmAppNostrLinkHandler,
  emitAppNostrSession,
  getAppNostrSessionHandler,
  requestAppNostrLinkChallengeHandler,
} from './nostrAppSession';
import { getNostrProfileHandler, publishSignedNostrEventHandler } from './nostrRelay';
import type { AppNostrSignerMode } from '../state/nostrAppSessionState';

function guardSocketAsync<T extends unknown[]>(
  socket: Socket,
  label: string,
  fn: (...args: T) => Promise<void>
) {
  return (...args: T) => {
    void fn(...args).catch((error) => {
      console.error(
        `${dateNow()} [${socket.data.sessionID ?? socket.id}] ${label} failed:`,
        error
      );
    });
  };
}

export default function registerSocketHandlers(io: Server) {
  io.use((socket: Socket, next) => {
    void middleware(io, socket, next).catch(next);
  });

  io.on('connection', (socket: Socket) => {
    emitAppNostrSession(socket);

    socket.on('requestAppNostrLinkChallenge', () => {
      requestAppNostrLinkChallengeHandler(socket);
    });
    socket.on(
      'confirmAppNostrLink',
      guardSocketAsync(
        socket,
        'confirmAppNostrLink',
        async (payload: { event: unknown; signerMode?: AppNostrSignerMode | null }) => {
          await confirmAppNostrLinkHandler(socket, payload);
        }
      )
    );
    socket.on('getAppNostrSession', () => {
      getAppNostrSessionHandler(socket);
    });
    socket.on('clearAppNostrSession', () => {
      clearAppNostrSessionHandler(socket);
    });
    socket.on(
      'getNostrProfile',
      guardSocketAsync(socket, 'getNostrProfile', async (payload: { pubkey?: string }) => {
        await getNostrProfileHandler(socket, payload);
      })
    );
    socket.on(
      'publishSignedNostrEvent',
      guardSocketAsync(socket, 'publishSignedNostrEvent', async (payload: { event: unknown }) => {
        await publishSignedNostrEventHandler(socket, payload);
      })
    );

    // TODO: Change to getP2PMenuInfos
    socket.on(
      'getGameMenuInfos',
      guardSocketAsync(socket, 'getGameMenuInfos', async (hostInfo?: { LNAddress: string }) => {
        const hostLNAddress =
          hostInfo && hostInfo.LNAddress ? hostInfo.LNAddress : undefined;
        await getP2PMenuInfos(socket, hostLNAddress);
      })
    );

    socket.on(
      'getPracticeMenuInfos',
      guardSocketAsync(socket, 'getPracticeMenuInfos', async (hostInfo?: { LNAddress: string }) => {
        const hostLNAddress =
          hostInfo && hostInfo.LNAddress ? hostInfo.LNAddress : undefined;
        await getPracticeMenuInfos(socket, hostLNAddress);
      })
    );

    socket.on(
      'getGameMenuInfosNostr',
      guardSocketAsync(socket, 'getGameMenuInfosNostr', async (hostInfo?: { LNAddress: string }) => {
        const hostLNAddress =
          hostInfo && hostInfo.LNAddress ? hostInfo.LNAddress : undefined;
        await getNostrP2PMenuInfos(socket, hostLNAddress);
      })
    );

    socket.on('cancelp2p', () => {
      cancelP2P(socket);
    });

    socket.on(
      'getTournamentInfos',
      guardSocketAsync(
        socket,
        'getTournamentInfos',
        async (data?: { buyin: number; players: number; hostLNAddress?: string }) => {
          await getTournamentMenuInfos(socket, data);
        }
      )
    );

    socket.on(
      'getTournamentInfosNostr',
      guardSocketAsync(
        socket,
        'getTournamentInfosNostr',
        async (data?: { buyin: number; players: number; hostLNAddress?: string }) => {
          await getTournamentNostrInfos(socket, data);
        }
      )
    );

    socket.on(
      'canceltournament',
      guardSocketAsync(socket, 'canceltournament', async () => {
        await cancelTournament(socket);
      })
    );

    // TODO: Change to getGameInfos
    socket.on('getDuelInfos', () => {
      gameInfos(socket);
    });

    socket.on(
      'gameFinished',
      guardSocketAsync(socket, 'gameFinished', async (winnerP) => {
        gameFinished(socket, winnerP);
      })
    );

    socket.on('postGameInfoRequest', () => {
      postGameInfo(socket);
    });

    socket.on(
      'createWithdrawalPostGame',
      guardSocketAsync(socket, 'createWithdrawalPostGame', async () => {
        await createWithdrawalPostGame(socket);
      })
    );

    socket.on(
      'createOnlineRoom',
      guardSocketAsync(
        socket,
        'createOnlineRoom',
        async (payload?: { buyin?: number; hostLNAddress?: string }) => {
          await createOnlineRoomHandler(socket, payload);
        }
      )
    );
    socket.on('listOnlineRooms', () => {
      listOnlineRoomsHandler(socket);
    });
    socket.on('listOnlineArchivedRooms', () => {
      listOnlineArchivedRoomsHandler(socket);
    });
    socket.on('listOnlineHistory', () => {
      listOnlineHistoryHandler(socket);
    });
    socket.on('pingLatency', (cb: (() => void) | undefined) => {
      pingLatencyHandler(socket, cb);
    });
    socket.on(
      'reportOnlineRoomPing',
      (payload: { roomId: string; latencyMs: number }) => {
        reportOnlineRoomPingHandler(socket, payload);
      }
    );
    socket.on('joinOnlineRoom', (payload: { roomId: string }) => {
      joinOnlineRoomHandler(socket, payload);
    });
    socket.on('joinOnlineRoomByCode', (payload: { roomCode: string }) => {
      joinOnlineRoomByCodeHandler(socket, payload);
    });
    socket.on('spectateOnlineRoom', (payload: { roomId: string }) => {
      spectateOnlineRoomHandler(socket, payload);
    });
    socket.on('leaveOnlineRoom', (payload?: { roomId?: string }) => {
      leaveOnlineRoomHandler(socket, payload);
    });
    socket.on('cancelOnlineRoom', (payload: { roomId: string }) => {
      cancelOnlineRoomHandler(socket, payload);
    });
    socket.on('getOnlineRoomState', (payload: { roomId: string; matchRound?: number }) => {
      getOnlineRoomStateHandler(socket, payload);
    });
    socket.on(
      'roomInput',
      (payload: {
        roomId: string;
        input: { up?: boolean; down?: boolean; left?: boolean; right?: boolean };
      }) => {
        roomInputHandler(socket, payload);
      }
    );
    socket.on('startOnlineGame', (payload: { roomId: string }) => {
      startOnlineGameHandler(socket, payload);
    });
    socket.on('onlineSetReady', (payload: { roomId: string; ready: boolean }) => {
      onlineSetReadyHandler(socket, payload);
    });
    socket.on('getOnlinePostGame', (payload: { roomId: string }) => {
      getOnlinePostGameHandler(socket, payload);
    });
    socket.on('getOnlineReplay', (payload: { roomId: string; matchRound?: number }) => {
      getOnlineReplayHandler(socket, payload);
    });
    socket.on(
      'createOnlineWithdrawal',
      guardSocketAsync(socket, 'createOnlineWithdrawal', async (payload: { roomId: string }) => {
        await createOnlineWithdrawalHandler(socket, payload);
      })
    );
    socket.on(
      'createOnlineNostrPayout',
      guardSocketAsync(socket, 'createOnlineNostrPayout', async (payload: { roomId: string }) => {
        await createOnlineNostrPayoutHandler(socket, payload);
      })
    );
    socket.on('onlineDoubleOrNothing', (payload: { roomId: string }) => {
      onlineDoubleOrNothingHandler(socket, payload);
    });
    socket.on('requestOnlineNostrLinkChallenge', (payload: { roomId: string }) => {
      requestOnlineNostrLinkChallengeHandler(socket, payload);
    });
    socket.on('confirmOnlineNostrLink', (payload: { roomId: string; event: unknown }) => {
      void confirmOnlineNostrLinkHandler(socket, payload);
    });
    socket.on('requestOnlineKind1Post', (payload: { roomId: string }) => {
      requestOnlineKind1PostHandler(socket, payload);
    });
    socket.on('requestOnlineSeatZapPayPrepare', (payload: { roomId: string }) => {
      requestOnlineSeatZapPayPrepareHandler(socket, payload);
    });
    socket.on('confirmOnlineSeatZapPay', (payload: { roomId: string; event: unknown }) => {
      confirmOnlineSeatZapPayHandler(socket, payload);
    });
    socket.on(
      'requestOnlineSeatLightning',
      guardSocketAsync(socket, 'requestOnlineSeatLightning', async (payload: { roomId: string }) => {
        await requestOnlineSeatLightningHandler(socket, payload);
      })
    );
    socket.on('cancelOnlineSeatLightning', () => {
      cancelOnlineSeatLightningHandler(socket);
    });

    socket.on('disconnect', () => {
      const sessionID = socket.data.sessionID as string | undefined;
      if (sessionID) {
        leaveRoom(sessionID);
      }
    });
  });

  startMempoolBlockWatcher(io);
  startOnlineLoop();
}
