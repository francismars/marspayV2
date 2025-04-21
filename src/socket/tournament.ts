import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getLNURLWFromID } from '../state/lnurlwState';
import {
  appendLNURLPToID,
  getLNURLPsFromID,
  setLNURLPToID,
} from '../state/lnurlpState';
import { GameInfo, GameMode, PlayerInfoFromRole } from '../types/game';
import { serializeGameInfoFromID, setGameInfoByID } from '../state/gameState';
import createLNURLP from '../calls/LNBits/createLNURLP';

export async function getTournamentMenuInfos(
  socket: Socket,
  data?: { buyin: number; players: number }
) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Requested necessary informations for Tournament Menu.`
  );
  const LNURLW = getLNURLWFromID(sessionID);
  if (!LNURLW) {
    const LNURLPs = getLNURLPsFromID(sessionID);
    if (!LNURLPs) {
      if (!data?.buyin || !data?.players) {
        console.log(
          `${dateNow()} [${sessionID}] No data provided. Cannot create LNURLP.`
        );
        return;
      }
      console.log(
        `${dateNow()} [${sessionID}] There is no associated LNRURLP. Creating new one.`
      );
      try {
        await newLNURLPTournament(sessionID, data.buyin);
        const gameMode = GameMode.TOURNAMENT;
        const players: PlayerInfoFromRole = new Map();
        const numberOfPlayers = data.players;
        const newGameInfo: GameInfo = {
          gamemode: gameMode,
          players: players,
          numberOfPlayers: numberOfPlayers,
        };
        setGameInfoByID(sessionID, newGameInfo);
      } catch (error) {
        console.error(
          `${dateNow()} [${sessionID}] Error creating LNURLP: ${error}`
        );
        return error;
      }
    } else if (LNURLPs) {
      if (LNURLPs[0].mode !== GameMode.TOURNAMENT) {
        console.log(
          `${dateNow()} [${sessionID}] Found existing LNRURLPs but they are not TOURNAMENT.`
        );
        return;
      }
      console.log(`${dateNow()} [${sessionID}] Found existing LNRURLP.`);
    }
    const newLNURLPs = getLNURLPsFromID(sessionID);
    if (!newLNURLPs) {
      console.log(`${dateNow()} [${sessionID}] LNURLP doesn't exist.`);
      return;
    }
    console.log(`${dateNow()} [${sessionID}] Sending LNRURLP to client.`);
    const gameInfo = serializeGameInfoFromID(sessionID);
    socket.emit('resGetTournamentInfos', {
      gameInfo: gameInfo,
      lnurlp: newLNURLPs![0].lnurlp,
      min: newLNURLPs![0].min,
    });
  } else if (LNURLW) {
    console.log(
      `${dateNow()} [${sessionID}] Found existing LNRURLW. Sending to client.`
    );
    const gameInfo = serializeGameInfoFromID(sessionID);
    if (gameInfo?.gamemode !== GameMode.TOURNAMENT) {
      console.log(
        `${dateNow()} [${sessionID}] Found existing LNRURLW but game mode is not TOURNAMENT.`
      );
      return;
    }
    const LNURLPs = getLNURLPsFromID(sessionID);
    if (!LNURLPs) {
      console.log(`${dateNow()} [${sessionID}] Tournament already started.`);
      return;
    }
    socket.emit('resGetTournamentInfos', {
      gameInfo: gameInfo,
      lnurlw: LNURLW.lnurlw,
      min: LNURLPs![0].min,
      claimedCount: LNURLW.claimedCount,
    });
  }
}

async function newLNURLPTournament(sessionID: any, buyin: number) {
  const LNURLPDescription = 'Chain Duel Tournament';
  console.log(
    `${dateNow()} [${sessionID}] Requesting new LNURLP with description ${LNURLPDescription} with buy-in of ${buyin} sats.`
  );
  try {
    const newLNURLP = await createLNURLP(LNURLPDescription, buyin, buyin);
    if (newLNURLP) {
      console.log(
        `${dateNow()} [${sessionID}] Created LNURLP ${newLNURLP.id}.`
      );
      newLNURLP.mode = GameMode.TOURNAMENT;
      appendLNURLPToID(sessionID, newLNURLP);
      setLNURLPToID(newLNURLP.id, sessionID);
    }
  } catch (error) {
    console.error(
      `${dateNow()} [${sessionID}] Error creating LNURLP: ${error}`
    );
    return error;
  }
}
