import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { dateNow } from '../../utils/time';
import { ndkInstance, setNDKInstance } from './setNDKInstance';

interface OnlineReplyMention {
  pubkey?: string;
  name?: string;
}

interface PublishOnlineKind1ReplyOpts {
  sessionID: string;
  rootEventId?: string;
  content: string;
  mentions?: OnlineReplyMention[];
}

function mentionKey(mention: OnlineReplyMention) {
  return mention.pubkey ? `pubkey:${mention.pubkey}` : `name:${mention.name ?? ''}`;
}

function formatMention(mention: OnlineReplyMention) {
  if (mention.pubkey) {
    return `nostr:${nip19.npubEncode(mention.pubkey)}`;
  }
  return mention.name ?? 'Unknown player';
}

export async function publishOnlineKind1Reply(opts: PublishOnlineKind1ReplyOpts) {
  if (!opts.rootEventId) {
    return;
  }
  if (!ndkInstance) {
    try {
      await setNDKInstance();
    } catch (error) {
      console.log(
        `${dateNow()} [${opts.sessionID}] [ONLINE] NDK not initialized for reply: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }
  }
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [['e', opts.rootEventId, '', 'root']];
  const validMentions = (opts.mentions ?? []).filter((mention) => !!mention.pubkey || !!mention.name);
  const dedupedMentions: OnlineReplyMention[] = [];
  const seen = new Set<string>();
  for (const mention of validMentions) {
    const key = mentionKey(mention);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedMentions.push(mention);
  }
  for (const mention of dedupedMentions) {
    if (mention.pubkey) {
      ndkEvent.tags.push(['p', mention.pubkey, '', 'mention']);
    }
  }
  const mentionLine =
    dedupedMentions.length > 0
      ? `\nPlayers: ${dedupedMentions.map((mention) => formatMention(mention)).join(' vs ')}`
      : '';
  ndkEvent.content = `${opts.content}${mentionLine}`;
  try {
    await ndkEvent.publish();
    const note1 = nip19.noteEncode(ndkEvent.id);
    console.log(`${dateNow()} [${opts.sessionID}] [ONLINE] Published room reply ${note1}.`);
  } catch (error) {
    console.log(
      `${dateNow()} [${opts.sessionID}] [ONLINE] Unable to publish room reply: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
