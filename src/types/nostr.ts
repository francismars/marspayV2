import { NDKSubscription } from '@nostr-dev-kit/ndk';

/** In-memory snapshot of a Kind1 we just published — avoids relay round-trips for display. */
export interface Kind1PublishedSnapshot {
  content: string;
  tags: string[][];
  pubkey: string;
  created_at: number;
}

export interface Kind1 {
  id: string;
  note1: string;
  emojis: string;
  min: number;
  mode: string;
  zapSubscription?: NDKSubscription;
  hostLNAddress?: string;
  numberOfPlayers?: number;
  /** Present when this process published the note (lost on server restart). */
  snapshot?: Kind1PublishedSnapshot;
}
