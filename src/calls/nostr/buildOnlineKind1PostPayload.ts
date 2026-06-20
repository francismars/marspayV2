import { nip19, type Event } from 'nostr-tools';
import { fetchNostrAppProfile } from './fetchNostrAppProfile';
import { parsePubpayZapTags } from './parsePubpayZapTags';

export type OnlineKind1PostPayload = {
  roomId: string;
  ok: true;
  eventId: string;
  tags: string[][];
  pubpayZap: ReturnType<typeof parsePubpayZapTags>;
  content: string;
  created_at: number;
  pubkey: string;
  npubDisplay: string;
  authorName: string;
  authorPicture: string | null;
  authorNip05: string | null;
  authorLud16: string | null;
};

export async function buildOnlineKind1PostPayload(
  roomId: string,
  ev: Event
): Promise<OnlineKind1PostPayload> {
  const npub = nip19.npubEncode(ev.pubkey);
  const npubDisplay = `${npub.slice(0, 18)}…${npub.slice(-12)}`;
  const pubpayZap = parsePubpayZapTags(ev.tags);
  const profile = await fetchNostrAppProfile(ev.pubkey);
  return {
    roomId,
    ok: true,
    eventId: ev.id,
    tags: ev.tags,
    pubpayZap,
    content: ev.content,
    created_at: ev.created_at,
    pubkey: ev.pubkey,
    npubDisplay,
    authorName: profile.name,
    authorPicture: profile.picture,
    authorNip05: profile.nip05,
    authorLud16: profile.lud16,
  };
}
