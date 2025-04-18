import { PlayerInfo, PlayerRole, GameInfo, GameMode } from '../types/game';
import { Payment } from '../types/game';

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

export function setPlayerInfoInGameByID(
  sessionId: string,
  player: PlayerRole,
  info: PlayerInfo,
  mode: GameMode
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo && mode) {
    IDToGameInfo.set(sessionId, {
      players: new Map<PlayerRole, PlayerInfo>(),
      gamemode: mode,
    });
    IDToGameInfo.get(sessionId)!.players.set(player, info);
    return;
  } else if (gameInfo) {
    gameInfo.players?.set(player, info);
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
    console.error('gameInfo not found.');
    return;
  }
  return {
    gamemode: gameInfo.gamemode,
    players: Object.fromEntries(gameInfo.players),
    winners: gameInfo.winners,
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
