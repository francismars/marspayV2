import { nip19, SimplePool, type Event } from 'nostr-tools';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';

const HEX64 = /^[0-9a-f]{64}$/i;

function parseNoteId(noteRef: string): { id: string; relays: string[] } {
  const trimmed = noteRef.trim();
  const withoutScheme = trimmed.replace(/^nostr:/i, '');
  if (HEX64.test(withoutScheme)) {
    return { id: withoutScheme.toLowerCase(), relays: NOSTR_RELAYS };
  }
  try {
    const d = nip19.decode(withoutScheme);
    if (d.type === 'note') {
      return { id: d.data, relays: NOSTR_RELAYS };
    }
    if (d.type === 'nevent') {
      const relays = d.data.relays?.length ? d.data.relays : NOSTR_RELAYS;
      return { id: d.data.id, relays };
    }
  } catch {
    /* fall through */
  }
  throw new Error('invalid_note_ref');
}

export async function fetchKind1NoteEvent(noteRef: string): Promise<Event> {
  const { id, relays } = parseNoteId(noteRef);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relays, {
      ids: [id],
      kinds: [1],
    });
    const ev = events[0];
    if (!ev) {
      throw new Error('note_not_found');
    }
    return ev;
  } finally {
    pool.close(relays);
  }
}
