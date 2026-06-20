import { nip19, type Event } from 'nostr-tools';
import { getKind1FromID } from '../../state/nostrState';
import { fetchKind1NoteEvent } from './fetchKind1NoteEvent';

const HEX64 = /^[0-9a-f]{64}$/i;

export function parseKind1NoteEventId(noteRef: string): string {
  const trimmed = noteRef.trim();
  const withoutScheme = trimmed.replace(/^nostr:/i, '');
  if (HEX64.test(withoutScheme)) {
    return withoutScheme.toLowerCase();
  }
  try {
    const d = nip19.decode(withoutScheme);
    if (d.type === 'note') {
      return d.data;
    }
    if (d.type === 'nevent') {
      return d.data.id;
    }
  } catch {
    /* fall through */
  }
  throw new Error('invalid_note_ref');
}

function snapshotToEvent(id: string, snapshot: {
  content: string;
  tags: string[][];
  pubkey: string;
  created_at: number;
}): Event {
  return {
    id,
    kind: 1,
    content: snapshot.content,
    tags: snapshot.tags,
    pubkey: snapshot.pubkey,
    created_at: snapshot.created_at,
    sig: '',
  };
}

/**
 * Resolve a Kind1 for display. Prefer in-memory snapshot from our own publish;
 * fall back to relays only after restart or for foreign notes.
 */
export async function resolveKind1NoteEvent(noteRef: string): Promise<Event> {
  const eventId = parseKind1NoteEventId(noteRef);
  const local = getKind1FromID(eventId);
  if (local?.snapshot) {
    return snapshotToEvent(eventId, local.snapshot);
  }
  return fetchKind1NoteEvent(noteRef);
}

/** Resolve by hex event id (online seat zaps, lud16 lookup). */
export async function resolveKind1NoteEventById(eventId: string): Promise<Event> {
  return resolveKind1NoteEvent(eventId);
}
