import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { relaysNostr } from '../../consts/nostrRelays';
import dotenv from 'dotenv';

let ndk: NDK | null = null;

async function setNDKInstance() {
  if (!ndk) {
    dotenv.config();
    const nostrPrivKey = process.env.NOSTR_PK;
    const pksigner = new NDKPrivateKeySigner(nostrPrivKey!);
    ndk = new NDK({
      signer: pksigner,
      explicitRelayUrls: [...relaysNostr],
    });
    await ndk.connect();
  }
}

export async function createAndPublishKind1(value: number, emojis: string) {
  await setNDKInstance();
  const ndkEvent = new NDKEvent(ndk!);
  ndkEvent.kind = 1;
  ndkEvent.tags = [
    ['t', 'pubpay'],
    ['zap-min', (value * 1000).toString()],
    ['zap-max', '1000000000'],
    ['zap-uses', '2'],
  ];
  ndkEvent.content = `DISREGARD: TESTING CHAIN DUEL NOSTR MODE ${emojis}'\n'
    Zap a minimum of ${value} sats to register.`;
  try {
    await ndkEvent.publish();
  } catch (error) {
    console.log("couldn't publish:", error);
  }
  return ndkEvent.id;
}

export async function subscribeEvent(eventType: number, eventID: string) {
  await setNDKInstance();
  ndk!.subscribe({ kinds: [eventType], '#e': [eventID] });
}
