import { PlayerInfo, PlayerRole, GameInfo, GameMode } from '../types/game';

const IDToGameInfo = new Map<string, GameInfo>();

export function getPlayerInfoFromIDToGame(sessionId: string) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    console.error('gameInfo not found.');
    return;
  }
  return gameInfo.players;
}

export function getGameInfoFromID(sessionId: string) {
  return IDToGameInfo.get(sessionId);
}

export function setPlayerInfoInGameByID(
  sessionId: string,
  player: PlayerRole,
  info: PlayerInfo,
  mode?: GameMode
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo && mode) {
    console.error('gameInfo not found. creating new one.');
    IDToGameInfo.set(sessionId, {
      players: new Map<PlayerRole, PlayerInfo>(),
      gamemode: GameMode.P2P,
    });
    const gameInfoByPlayerRole = IDToGameInfo.get(sessionId)!.players;
    gameInfoByPlayerRole.set(player, info);
    IDToGameInfo.get(sessionId)!.players.set(player, info);
    return;
  } else if (gameInfo) {
    gameInfo.players?.set(player, info);
    return;
  }
}

export function getPlayerValueFromGameSession(
  sessionId: string,
  player: PlayerRole
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
  return playerInfo.value;
}

export function getPlayerNameFromGameSession(
  sessionId: string,
  player: PlayerRole
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
  return playerInfo.name;
}

export function appendWinnerToGameInfo(sessionId: string, winner: PlayerRole) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    console.error('gameInfo not found.');
    return;
  }
  gameInfo!.winners
    ? gameInfo!.winners!.push(winner)
    : (gameInfo!.winners = [winner]);
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
    players: Object.fromEntries(gameInfo.players),
    gamemode: gameInfo.gamemode,
    winners: gameInfo.winners,
  };
}
