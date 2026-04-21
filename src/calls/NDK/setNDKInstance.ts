import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import dotenv from 'dotenv';
import { NOSTR_RELAYS } from '../../consts/nostrRelays';
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
    explicitRelayUrls: NOSTR_RELAYS,
  });
  console.log(`${dateNow()} [NDK] initializing with ${NOSTR_RELAYS.length} relays`);
  let connectedRelays = 0;
  const relayConnected = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log(
        `${dateNow()} [NDK] relay wait timeout after ${NDK_CONNECT_TIMEOUT_MS}ms (${connectedRelays}/${NOSTR_RELAYS.length} connected)`
      );
      resolve();
    }, NDK_CONNECT_TIMEOUT_MS);
    ndkInstance.pool.on('relay:connect', () => {
      connectedRelays++;
      console.log(
        `${dateNow()} [NDK] relay connected (${connectedRelays}/${NOSTR_RELAYS.length})`
      );
      if (connectedRelays > NOSTR_RELAYS.length / 2) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await ndkInstance.connect();
  await relayConnected;
  console.log(
    `${dateNow()} [NDK] ready (${connectedRelays}/${NOSTR_RELAYS.length} relays connected)`
  );
}
