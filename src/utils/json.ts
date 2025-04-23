import path from 'path';
import { serializeGameInfoFromID } from '../state/gameState';
import { dateNow } from './time';
import { promises as fs } from 'fs';

export function appendGameInfotoJSON(sessionID: string) {
  console.log(`${dateNow()} [${sessionID}] Writing game info to JSON.`);
  const gameInfo = serializeGameInfoFromID(sessionID);
  if (!gameInfo) {
    console.log(`${dateNow()} [${sessionID}] No gameInfo found.`);
    return;
  }
  if (gameInfo.gamemode === 'TOURNAMENT') {
    for (const [role, info] of Object.entries(gameInfo.players)) {
      gameInfo.players[role] = {
        name: info.name,
        value: info.value,
      };
    }
  }
  const gameInfoJson = JSON.stringify({
    [dateNow()]: gameInfo,
  });
  try {
    const savePath = path.resolve(__dirname, '../../public/');
    fs.appendFile(path.join(savePath, 'games.json'), gameInfoJson + ',\n');
  } catch (error) {
    console.error(
      `${dateNow()} [${sessionID}] Error writing game info to JSON: ${error}`
    );
  }
}
