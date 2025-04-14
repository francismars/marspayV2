import {
  PlayerInfoFromRole,
  PlayerInfo,
  PlayerRole,
  GameInfo,
  GameMode,
} from '../types/game';
import { LNURLP, Payment } from '../types/lnurlp';

const IDToSocket = new Map<string, string>();
const IDToLNURLW = new Map<string, string>();
const IDToLNURLPs = new Map<string, Array<LNURLP>>();
const LNURLPToID = new Map<string, string>();
const IDToGameInfo = new Map<string, GameInfo>();

export function setIDToSocket(sessionId: string, socketId: string) {
  IDToSocket.set(sessionId, socketId);
}

export function getSocketFromID(sessionId: string) {
  return IDToSocket.get(sessionId);
}

export function setIDToLNURLW(sessionId: string, lnurlw: string) {
  IDToLNURLW.set(sessionId, lnurlw);
}

export function getLNURLWFromID(sessionId: string) {
  return IDToLNURLW.get(sessionId);
}

export function appendLNURLPToID(sessionId: string, lnurlp: LNURLP) {
  if (IDToLNURLPs.has(sessionId)) {
    IDToLNURLPs.get(sessionId)?.push(lnurlp);
  } else {
    IDToLNURLPs.set(sessionId, [lnurlp]);
  }
}

export function getLNURLPsFromID(sessionId: string) {
  return IDToLNURLPs.get(sessionId);
}

export function setLNURLPToID(lnurlp: string, sessionId: string) {
  LNURLPToID.set(lnurlp, sessionId);
}

export function getIDFromLNURLP(lnurlp: string) {
  return LNURLPToID.get(lnurlp);
}

export function appendPaymentToLNURLPFromId(
  payment: Payment,
  lnurlPID: string,
  sessionId: string
) {
  if (IDToLNURLPs.has(sessionId)) {
    const lnurlp = IDToLNURLPs.get(sessionId)?.find(
      (lnurl) => lnurl.id === lnurlPID
    );
    if (!lnurlp) {
      console.error('LNURLP not found');
      return;
    }
    if (!lnurlp.payments) lnurlp.payments = [payment];
    else lnurlp.payments.push(payment);
  }
}

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
