import deleteLNURLP from '../calls/LNBits/deleteLNURLP';
import { dateNow } from '../utils/time';

/** Pending LNURL-pay link for anonymous online seat claim (maps webhook → session). */
export type OnlineSeatLightningRecord = {
  roomId: string;
  sessionID: string;
  socketID: string;
  buyin: number;
  expiresAt: number;
  lnurlpId: string;
  /** Ephemeral secp256k1 secret (hex) — signs NIP-57 zap request; matches `registerNostrLink` pubkey. */
  zapSecretKeyHex: string;
  zapPubkeyHex: string;
  /** `rematch` = double-or-nothing loser payment (zaps rematch kind1, not seat claim). */
  purpose?: 'seat' | 'rematch';
};

const byLnurlpId = new Map<string, OnlineSeatLightningRecord>();
const sessionToLnurlpId = new Map<string, string>();

function log(msg: string) {
  console.log(`${dateNow()} [ONLINE_SEAT_LN] ${msg}`);
}

function deleteLnurlpRecord(lnurlpId: string): void {
  const rec = byLnurlpId.get(lnurlpId);
  if (!rec) {
    return;
  }
  byLnurlpId.delete(lnurlpId);
  sessionToLnurlpId.delete(rec.sessionID);
}

/** Register or replace the pending pay link for this browser session. */
export function registerOnlineSeatLightning(record: OnlineSeatLightningRecord): void {
  const prev = sessionToLnurlpId.get(record.sessionID);
  if (prev && prev !== record.lnurlpId) {
    log(`replacing pending lnurlp session=${record.sessionID.slice(0, 8)}… old=${prev}`);
    deleteLnurlpRecord(prev);
    void deleteLNURLP(prev);
  }
  byLnurlpId.set(record.lnurlpId, record);
  sessionToLnurlpId.set(record.sessionID, record.lnurlpId);
  log(`registered lnurlp=${record.lnurlpId} room=${record.roomId} session=${record.sessionID.slice(0, 8)}…`);
}

export function removeOnlineSeatLightningForSession(sessionID: string): void {
  const id = sessionToLnurlpId.get(sessionID);
  if (!id) {
    return;
  }
  deleteLnurlpRecord(id);
  void deleteLNURLP(id);
  log(`cleared for session=${sessionID.slice(0, 8)}…`);
}

export function peekOnlineSeatLightningForSession(sessionID: string): OnlineSeatLightningRecord | undefined {
  const id = sessionToLnurlpId.get(sessionID);
  if (!id) {
    return undefined;
  }
  return byLnurlpId.get(id);
}

export function listOnlineSeatLightningRecordsForRoom(roomId: string): OnlineSeatLightningRecord[] {
  return [...byLnurlpId.values()].filter((r) => r.roomId === roomId);
}

export function removeOnlineSeatLightningForRoom(roomId: string): void {
  for (const [lnurlpId, rec] of [...byLnurlpId.entries()]) {
    if (rec.roomId === roomId) {
      deleteLnurlpRecord(lnurlpId);
      void deleteLNURLP(lnurlpId);
      log(`cleared for room=${roomId} lnurlp=${lnurlpId}`);
    }
  }
}

/** Valid non-expired pending record for webhook, or undefined. */
export function getOnlineSeatLightningByLnurlpId(lnurlpId: string): OnlineSeatLightningRecord | undefined {
  const rec = byLnurlpId.get(lnurlpId);
  if (!rec) {
    return undefined;
  }
  if (rec.expiresAt <= Date.now()) {
    removeOnlineSeatLightningForSession(rec.sessionID);
    return undefined;
  }
  return rec;
}

/** Remove mapping after successful seat assignment (LNURLP link deleted separately). */
export function consumeOnlineSeatLightningAfterSuccess(lnurlpId: string): void {
  deleteLnurlpRecord(lnurlpId);
}

export function refreshOnlineSeatLightningSocket(sessionID: string, socketID: string): void {
  const id = sessionToLnurlpId.get(sessionID);
  if (!id) {
    return;
  }
  const rec = byLnurlpId.get(id);
  if (rec) {
    rec.socketID = socketID;
  }
}
