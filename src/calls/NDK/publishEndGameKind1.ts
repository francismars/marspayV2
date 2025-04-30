import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getOpponent } from '../../socket/game';
import { getGameInfoFromID } from '../../state/gameState';
import { getKind1sfromSessionID } from '../../state/nostrState';
import { dateNow } from '../../utils/time';
import { nip19 } from 'nostr-tools';
import { ndkInstance } from './setNDKInstance';

export async function publishEndGameKind1(sessionID: string) {
  const gameInfo = getGameInfoFromID(sessionID);
  if (!gameInfo) {
    console.error(`${dateNow()} [${sessionID}] Game info not found.`);
    return;
  }
  const winner = gameInfo.winners?.slice(-1)[0];
  if (!winner) {
    console.error(`${dateNow()} [${sessionID}] Winner not found.`);
    return;
  }
  const winnerID = gameInfo.players.get(winner)!.id;
  const winnernprofile = nip19.npubEncode(winnerID!);
  const kind1Info = getKind1sfromSessionID(sessionID)!.slice(-1)[0];
  const loser = getOpponent(winner);
  const loserID = gameInfo.players.get(loser)!.id;
  const losernprofile = nip19.npubEncode(loserID!);
  const replyEventID = kind1Info.id;
  const emojisGame = kind1Info.emojis;
  const winnerAmount = gameInfo.players.get(winner)!.value;
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [['e', replyEventID, '', 'root']];
  ndkEvent.tags.push(['p', winnerID!, '', 'mention']);
  ndkEvent.tags.push(['p', loserID!, '', 'mention']);
  ndkEvent.content = `Chain Duel P2P Game ${emojisGame} is finished.\nnostr:${winnernprofile} wins ${winnerAmount} sats!\nBetter luck next time nostr:${losernprofile}.`;
  await ndkEvent.publish();
}
