import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { appendKind1toSessionID, setKind1IDtoSessionID } from '../../state/nostrState';
import { GameMode } from '../../types/game';
import { dateNow } from '../../utils/time';
import { ndkInstance, setNDKInstance } from './setNDKInstance';
import { subscribeEvent } from './subscribeEvent';

interface PublishOnlineRematchKind1Opts {
  sessionID: string;
  rootEventId?: string;
  emojis: string;
  amount: number;
  loserPubkey?: string;
  loserName?: string;
}

export async function publishOnlineRematchKind1(opts: PublishOnlineRematchKind1Opts) {
  if (!opts.rootEventId) {
    return;
  }
  if (!ndkInstance) {
    await setNDKInstance();
  }
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', String(opts.amount * 1000)],
    ['zap-max', String(opts.amount * 1000)],
    ['zap-uses', '1'],
    ['e', opts.rootEventId, '', 'root'],
  ];
  if (opts.loserPubkey) {
    ndkEvent.tags.push(['p', opts.loserPubkey, '', 'mention']);
  }
  const loserMention = opts.loserPubkey
    ? `nostr:${nip19.npubEncode(opts.loserPubkey)}`
    : opts.loserName ?? 'loser';
  ndkEvent.content = `ONLINE NEXT STEP ${opts.emojis}\nDouble or Nothing accepted.\nWaiting for ${loserMention} to zap exactly ${opts.amount} sats to continue.`;
  await ndkEvent.publish();
  setKind1IDtoSessionID(ndkEvent.id, opts.sessionID);
  const note1 = nip19.noteEncode(ndkEvent.id);
  const subscription = await subscribeEvent(9735, ndkEvent.id);
  appendKind1toSessionID(opts.sessionID, {
    id: ndkEvent.id,
    note1,
    emojis: opts.emojis,
    min: opts.amount,
    mode: GameMode.ONLINE,
    zapSubscription: subscription,
  });
  console.log(
    `${dateNow()} [${opts.sessionID}] [ONLINE] Created rematch payment event ${note1} for ${opts.amount} sats.`
  );
  return { eventId: ndkEvent.id, note1 };
}
