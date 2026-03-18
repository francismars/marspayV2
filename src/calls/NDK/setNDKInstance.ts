import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import dotenv from 'dotenv';
import { relaysNostr } from '../../consts/nostrRelays';
import { dateNow } from '../../utils/time';

export let ndkInstance: NDK;
const NDK_CONNECT_TIMEOUT_MS = 7000;

export async function setNDKInstance() {
  if (ndkInstance) {
    return;
  }
  dotenv.config();
  const nostrPrivKey = process.env.NOSTR_PK;
  if (!nostrPrivKey) {
    throw new Error('NOSTR_PK is missing in environment');
  }
  const pksigner = new NDKPrivateKeySigner(nostrPrivKey!);
  ndkInstance = new NDK({
    signer: pksigner,
    explicitRelayUrls: relaysNostr,
  });
  console.log(`${dateNow()} [NDK] initializing with ${relaysNostr.length} relays`);
  let connectedRelays = 0;
  const relayConnected = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log(
        `${dateNow()} [NDK] relay wait timeout after ${NDK_CONNECT_TIMEOUT_MS}ms (${connectedRelays}/${relaysNostr.length} connected)`
      );
      resolve();
    }, NDK_CONNECT_TIMEOUT_MS);
    ndkInstance.pool.on('relay:connect', () => {
      connectedRelays++;
      console.log(
        `${dateNow()} [NDK] relay connected (${connectedRelays}/${relaysNostr.length})`
      );
      if (connectedRelays > relaysNostr.length / 2) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await ndkInstance.connect();
  await relayConnected;
  console.log(
    `${dateNow()} [NDK] ready (${connectedRelays}/${relaysNostr.length} relays connected)`
  );
}
