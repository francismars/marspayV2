import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import dotenv from 'dotenv';
import { relaysNostr } from '../../consts/nostrRelays';

export let ndkInstance: NDK;

export async function setNDKInstance() {
  if (ndkInstance) {
    return;
  }
  dotenv.config();
  const nostrPrivKey = process.env.NOSTR_PK;
  const pksigner = new NDKPrivateKeySigner(nostrPrivKey!);
  ndkInstance = new NDK({
    signer: pksigner,
    explicitRelayUrls: relaysNostr,
  });
  let connectedRelays = 0;
  const relayConnected = new Promise<void>((resolve) => {
    ndkInstance.pool.on('relay:connect', () => {
      connectedRelays++;
      if (connectedRelays > relaysNostr.length / 2) {
        resolve();
      }
    });
  });
  await ndkInstance.connect();
  await relayConnected;
}
