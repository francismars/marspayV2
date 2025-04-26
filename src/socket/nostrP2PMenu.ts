import { Socket } from 'socket.io';
import { dateNow } from '../utils/time';
import { getLNURLWFromID } from '../state/lnurlwState';
import { serializeGameInfoFromID } from '../state/gameState';
import { createAndPublishKind1, subscribeEvent } from '../calls/nostr/ndk';
import { nip19 } from 'nostr-tools';
import { GameMode } from '../types/game';
import { BUYINMIN } from '../consts/values';
import { ALLOWEDEMOJIS } from '../consts/emojis';
import {
  appendKind1toSessionID,
  getKind1sfromSessionID,
  setKind1IDtoSessionID,
} from '../state/nostrState';

export async function getNostrP2PMenuInfos(socket: Socket) {
  const sessionID = socket.data.sessionID;
  if (!sessionID) {
    console.error(`${dateNow()} [${sessionID}] Session ID not found.`);
    return;
  }
  console.log(
    `${dateNow()} [${sessionID}] Requested necessary informations for Nostr Game Menu.`
  );
  const LNURW = getLNURLWFromID(sessionID);
  if (LNURW) {
    console.log(`${dateNow()} [${sessionID}] Found associated LNURLW.`);
    socket.emit('resGetGameMenuInfos', { lnurlw: LNURW });
    return;
  }
  const note1 = getKind1sfromSessionID(sessionID);
  if (note1) {
    console.log(`${dateNow()} [${sessionID}] Found associated Nostr Event.`);
    socket.emit('resGetGameMenuInfos', note1);
    const gameInfo = serializeGameInfoFromID(sessionID);
    if (gameInfo) {
      console.log(
        `${dateNow()} [${sessionID}] Previous deposits found. Sending existing information.`
      );
      socket.emit('updatePayments', gameInfo);
    }
    return;
  }
  const emojirandom = [...Array(4)]
    .map((_) => ALLOWEDEMOJIS[(Math.random() * ALLOWEDEMOJIS.length) | 0])
    .join('');
  const kind1ID = await createAndPublishKind1(BUYINMIN, emojirandom);
  if (!kind1ID) {
    console.log(
      `${dateNow()} [${sessionID}] Unable to publish Game event on Nostr.`
    );
    return;
  }
  setKind1IDtoSessionID(sessionID, kind1ID);
  const encodedEvent = nip19.noteEncode(kind1ID);
  console.log(
    `${dateNow()} [${sessionID}] Created Nostr Event ${encodedEvent}.`
  );
  let eventinfo = {
    id: kind1ID,
    note1: encodedEvent,
    min: BUYINMIN,
    emojis: emojirandom,
    mode: GameMode.P2PNOSTR,
  };
  appendKind1toSessionID(sessionID, eventinfo);
  await subscribeEvent(9734, kind1ID);
  const kind1 = getKind1sfromSessionID(sessionID);
  socket.emit('resGetGameMenuInfos', kind1);
}
