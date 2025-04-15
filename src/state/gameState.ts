import { PlayerInfo, PlayerRole, GameInfo, GameMode } from '../types/game';
import { Payment } from '../types/game';

const IDToGameInfo = new Map<string, GameInfo>();

export function getPlayerInfoFromIDToGame(
  sessionId: string,
  player: PlayerRole
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    console.error('gameInfo not found.');
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
  mode?: GameMode
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo && mode) {
    console.error('gameInfo not found. creating new one.');
    IDToGameInfo.set(sessionId, {
      players: new Map<PlayerRole, PlayerInfo>(),
      gamemode: GameMode.P2P,
    });
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

export function appendPaymentToGameById(
  payment: Payment,
  playerRole: PlayerRole,
  sessionId: string
) {
  const gameInfo = IDToGameInfo.get(sessionId);
  if (!gameInfo) {
    return console.error('gameInfo not found.');
  }
  const playerInfo = gameInfo.players.get(playerRole);
  if (!playerInfo) {
    console.error('playerInfo not found.');
    return;
  }
  if (!playerInfo.payments) playerInfo.payments = [payment];
  else playerInfo.payments.push(payment);
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

export function serializeIDToGameInfo() {
  const serializedIDToGameInfo: Record<string, any> = {};
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

export function getAllIDtoGameInfo() {
  return IDToGameInfo;
}
