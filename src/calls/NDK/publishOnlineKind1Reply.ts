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
  /** Thread root (original room Kind1). */
  rootEventId?: string;
  /** Immediate parent for a linear chain (defaults to root when omitted). */
  parentEventId?: string;
  content: string;
  mentions?: OnlineReplyMention[];
  /** When false, do not append a second "Players: …" line (content already lists players). */
  appendMentionLine?: boolean;
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

export async function publishOnlineKind1Reply(
  opts: PublishOnlineKind1ReplyOpts
): Promise<string | undefined> {
  if (!opts.rootEventId) {
    return undefined;
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
      return undefined;
    }
  }
  const parentId = opts.parentEventId?.trim() || opts.rootEventId;
  const ndkEvent = new NDKEvent(ndkInstance);
  ndkEvent.kind = 1;
  ndkEvent.tags = [['e', opts.rootEventId, '', 'root']];
  if (parentId !== opts.rootEventId) {
    ndkEvent.tags.push(['e', parentId, '', 'reply']);
  }
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
  const appendMentionLine = opts.appendMentionLine !== false;
  const mentionLine =
    appendMentionLine && dedupedMentions.length > 0
      ? `\nPlayers: ${dedupedMentions.map((mention) => formatMention(mention)).join(' vs ')}`
      : '';
  ndkEvent.content = `${opts.content}${mentionLine}`;
  try {
    await ndkEvent.publish();
    const note1 = nip19.noteEncode(ndkEvent.id);
    console.log(`${dateNow()} [${opts.sessionID}] [ONLINE] Published room reply ${note1}.`);
    return ndkEvent.id;
  } catch (error) {
    console.log(
      `${dateNow()} [${opts.sessionID}] [ONLINE] Unable to publish room reply: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}
