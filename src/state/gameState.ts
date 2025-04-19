import { PlayerInfo, PlayerRole, GameInfo, GameMode } from '../types/game';

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
    gamemode: gameInfo.gamemode,
    players: Object.fromEntries(gameInfo.players),
    winners: gameInfo.winners,
    numberOfPlayers: gameInfo.numberOfPlayers
  };
}

export function getSerializedIDToGameInfo() {
  const serializedIDToGameInfo: Record<
    string,
    {
      gamemode: GameMode;
      players: Record<string, PlayerInfo>;
      winners?: PlayerRole[];
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
    console.error('gameInfo not found.');
    return;
  }
  IDToGameInfo.delete(sessionId);
}
