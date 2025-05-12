import { NDKSubscription } from '@nostr-dev-kit/ndk';

export interface Kind1 {
  id: string;
  note1: string;
  emojis: string;
  min: number;
  mode: string;
  zapSubscription: NDKSubscription;
  hostLNAddress?: string;
}
