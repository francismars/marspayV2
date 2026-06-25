import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { onlineRoomPublicUrl } from '../../consts/gamePublicUrl';
import { appendKind1toSessionID, setKind1IDtoSessionID } from '../../state/nostrState';
import { GameMode } from '../../types/game';
import { dateNow } from '../../utils/time';
import { ndkInstance, setNDKInstance } from './setNDKInstance';
import { subscribeEvent } from './subscribeEvent';
import { snapshotFromNdkEvent } from '../nostr/kind1PublishedSnapshot';

interface PublishOnlineRematchKind1Opts {
  sessionID: string;
  /** Thread root (original room Kind1). */
  rootEventId?: string;
  /** Parent note in the linear thread (e.g. match result). */
  parentEventId?: string;
  roomId: string;
  roomCode: string;
  amount: number;
  loserPubkey?: string;
  loserName?: string;
  /** When `lightning`, note must not pin a Nostr identity — payer uses ephemeral keys per payment. */
  loserPayMethod?: 'lightning' | 'nostr_web' | 'nostr_app';
}

export async function publishOnlineRematchKind1(opts: PublishOnlineRematchKind1Opts) {
  if (!opts.rootEventId) {
    return;
  }
  if (!ndkInstance) {
    await setNDKInstance();
  }
  const pinNostrIdentity =
    opts.loserPayMethod !== 'lightning' && Boolean(opts.loserPubkey?.trim());
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  const parentId = opts.parentEventId?.trim() || opts.rootEventId;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', String(opts.amount * 1000)],
    ['zap-max', String(opts.amount * 1000)],
    ['zap-uses', '1'],
    ['e', opts.rootEventId, '', 'root'],
    ['e', parentId, '', 'reply'],
  ];
  if (pinNostrIdentity && opts.loserPubkey) {
    ndkEvent.tags.push(['p', opts.loserPubkey, '', 'mention']);
  }
  const loserLabel = pinNostrIdentity
    ? `nostr:${nip19.npubEncode(opts.loserPubkey!)}`
    : opts.loserName?.trim() || 'the losing player';
  const roomCode = opts.roomCode.trim().toUpperCase() || 'N/A';
  const roomUrl = onlineRoomPublicUrl(roomCode);
  ndkEvent.content = [
    `ONLINE REMATCH · room ${roomCode}`,
    `Waiting for ${loserLabel} to zap exactly ${opts.amount} sats to continue.`,
    '',
    `Join / spectate: ${roomUrl}`,
  ].join('\n');
  await ndkEvent.publish();
  setKind1IDtoSessionID(ndkEvent.id, opts.sessionID);
  const note1 = nip19.noteEncode(ndkEvent.id);
  const subscription = await subscribeEvent(9735, ndkEvent.id);
  appendKind1toSessionID(opts.sessionID, {
    id: ndkEvent.id,
    note1,
    emojis: '',
    min: opts.amount,
    mode: GameMode.ONLINE,
    zapSubscription: subscription,
    snapshot: snapshotFromNdkEvent(ndkEvent),
  });
  console.log(
    `${dateNow()} [${opts.sessionID}] [ONLINE] Created rematch payment event ${note1} for ${opts.amount} sats.`
  );
  return { eventId: ndkEvent.id, note1 };
}
