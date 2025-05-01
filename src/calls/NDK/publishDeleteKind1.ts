import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ndkInstance } from '../../calls/NDK/setNDKInstance';

export async function publishDeleteKind1(eventID: string) {
  if (!ndkInstance) {
    console.log('NDK not initialized');
    return;
  }
  const event = new NDKEvent(ndkInstance);
  event.kind = 5;
  event.tags = [['e', eventID]];
  event.content = '';
  try {
    await event.publish();
  } catch (error) {
    console.log(`Unable to publish Delete event on Nostr: ${error}`);
    return;
  }
}
