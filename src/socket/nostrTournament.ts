import { Socket } from 'socket.io';
import { setNDKInstance } from '../calls/NDK/setNDKInstance';
import { publishGameKind1 } from '../calls/NDK/publishGameKind1';
import { getGameInfoFromID, serializeGameInfoFromID, setGameInfoByID } from '../state/gameState';
import { getKind1sfromSessionID } from '../state/nostrState';
import { GameInfo, GameMode, PlayerInfoFromRole } from '../types/game';
import { dateNow } from '../utils/time';

interface TournamentNostrData {
  buyin: number;
  players: number;
  hostLNAddress?: string;
}

export async function getTournamentNostrInfos(socket: Socket, data?: TournamentNostrData) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  console.log(`${dateNow()} [${sessionID}] Requested Tournament Nostr information.`);

  const gameInfo = getGameInfoFromID(sessionID);
  if (!gameInfo) {
    if (!data?.buyin || !data?.players) {
      console.log(`${dateNow()} [${sessionID}] Missing buyin/players for new Tournament Nostr.`);
      return;
    }
    const players: PlayerInfoFromRole = new Map();
    const newGameInfo: GameInfo = {
      mode: GameMode.TOURNAMENTNOSTR,
      players,
      numberOfPlayers: data.players,
    };
    setGameInfoByID(sessionID, newGameInfo);
  } else if (gameInfo.mode !== GameMode.TOURNAMENTNOSTR) {
    console.log(
      `${dateNow()} [${sessionID}] Existing game mode ${gameInfo.mode} is incompatible with Tournament Nostr.`
    );
    return;
  }

  await setNDKInstance();
  const latestKind1 = getKind1sfromSessionID(sessionID)?.slice(-1)[0];
  const canReusePost =
    latestKind1 &&
    latestKind1.mode === GameMode.TOURNAMENTNOSTR &&
    latestKind1.numberOfPlayers === (data?.players ?? getGameInfoFromID(sessionID)?.numberOfPlayers);

  if (!canReusePost) {
    await publishGameKind1(sessionID, {
      mode: GameMode.TOURNAMENTNOSTR,
      buyin: data?.buyin,
      numberOfPlayers: data?.players ?? getGameInfoFromID(sessionID)?.numberOfPlayers,
      hostLNAddress: data?.hostLNAddress,
    });
  }

  const nostrMeta = getKind1sfromSessionID(sessionID)?.slice(-1)[0];
  if (!nostrMeta) {
    console.log(`${dateNow()} [${sessionID}] Tournament Nostr event metadata not found.`);
    return;
  }

  const serialized = serializeGameInfoFromID(sessionID);
  socket.emit('resGetTournamentInfosNostr', {
    gameInfo: serialized,
    nostrMeta: {
      note1: nostrMeta.note1,
      emojis: nostrMeta.emojis,
      min: nostrMeta.min,
      mode: nostrMeta.mode,
      playersNeeded: getGameInfoFromID(sessionID)?.numberOfPlayers ?? data?.players ?? 0,
      currentAdmissions: serialized?.players ? Object.keys(serialized.players).length : 0,
    },
  });
}
