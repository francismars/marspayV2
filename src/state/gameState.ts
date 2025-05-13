import { PlayerInfo, PlayerRole, GameInfo, GameMode } from '../types/game';
import { buildWinnerNamesList } from '../utils/winnerNames';

const IDToGameInfo = new Map<string, GameInfo>();

export function getPlayerInfoFromIDToGame(
  sessionId: string,
  player: PlayerRole
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    return;
  }
  return gameInfo.players.get(player);
}

export function getGameInfoFromID(sessionId: string) {
  return IDToGameInfo.get(sessionId);
}

export function setGameInfoByID(sessionId: string, newGameInfo: GameInfo) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    IDToGameInfo.set(sessionId, newGameInfo);
    return;
  } else if (gameInfo) {
    for (const [playerRole, playerInfo] of newGameInfo.players) {
      gameInfo.players?.set(playerRole, playerInfo);
    }

    return;
  }
}

export function appendWinnerToGameInfo(sessionId: string, winner: PlayerRole) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    console.error('gameInfo not found.');
    return;
  }
  if (!gameInfo.winners) {
    gameInfo.winners = [];
  }
  gameInfo!.winners!.push(winner);
}

export function setValueToGameInfoFromID(
  sessionId: string,
  player: PlayerRole,
  value: number
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    console.error('gameInfo not found.');
    return;
  }
  const playerInfo = gameInfo.players.get(player);
  if (!playerInfo) {
    console.error('player not found.');
    return;
  }
  playerInfo.value = value;
  gameInfo.players.set(player, playerInfo);
  IDToGameInfo.set(sessionId, gameInfo);
}

export function serializeGameInfoFromID(sessionId: string) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    return;
  }
  return {
    mode: gameInfo.mode,
    numberOfPlayers: gameInfo.numberOfPlayers,
    players: Object.fromEntries(gameInfo.players),
    winners: gameInfo.winners,
    champion: gameInfo.champion,
  };
}

export function getSerializedIDToGameInfo() {
  const serializedIDToGameInfo: Record<
    string,
    {
      mode: GameMode;
      numberOfPlayers?: number;
      players: Record<string, PlayerInfo>;
      winners?: PlayerRole[];
      champion?: string;
    }
  > = {};
  for (const [sessionID, gameInfo] of IDToGameInfo.entries()) {
    serializedIDToGameInfo[sessionID] = {
      ...gameInfo,
      players: Object.fromEntries(gameInfo.players),
    };
  }
  return serializedIDToGameInfo;
}

export function deleteGameInfoByID(sessionId: string) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    return;
  }
  IDToGameInfo.delete(sessionId);
}

export function setChampionToGameInfo(sessionID: string) {
  const gameInfo = IDToGameInfo.get(sessionID);
  if (!gameInfo || !gameInfo.winners || !gameInfo.players) {
    console.error('Could not set Champion.');
    return;
  }
  const champion = buildWinnerNamesList(gameInfo.players, gameInfo.winners).at(
    -1
  );
  gameInfo.champion = champion;
  IDToGameInfo.set(sessionID, gameInfo);
}
