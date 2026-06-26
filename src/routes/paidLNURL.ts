import { Router, Request, Response } from 'express';
import { dateNow } from '../utils/time';
import { sessionSocketRoomName } from '../state/sessionState';
import { getIDFromLNURLP, getLNURLPsFromID } from '../state/lnurlpState';
import {
  serializeGameInfoFromID,
  getPlayerInfoFromIDToGame,
  setGameInfoByID,
  getGameInfoFromID,
} from '../state/gameState';
import {
  GameInfo,
  GameMode,
  Payment,
  PlayerInfo,
  PlayerRole,
} from '../types/game';
import { io } from '../server';
import { ExtendedError } from 'socket.io';
import dotenv from 'dotenv';
import { DESIGNERPERCENT, DEVPERCENT, HOSTPERCENT } from '../consts/splits';
import getLNURLCallback from '../calls/LNAddress/getLNURLCallback';
import getInvoiceFromCallback from '../calls/LNAddress/getInvoiceFromCallback';
import payInvoice from '../calls/LNBits/payInvoice';
import { Split } from '../types/split';
import { normalizeIP } from '../utils/ip';
import { LNURLP } from '../types/lnurlp';
import deleteLNURLP from '../calls/LNBits/deleteLNURLP';
import { requestZapInvoiceAndPayForKind1 } from '../calls/NDK/zapKind1ViaLnurlCallback';
import { resolveOnlineSeatZapContext } from '../calls/nostr/resolveOnlineSeatZapContext';
import { hexToBytes } from '@noble/hashes/utils';
import { trackOnlineOk, trackOnlineReject } from '../telemetry/onlineTelemetry';
import { resolveTrackPubkeyPrefix } from '../telemetry/resolveTrackPubkeyPrefix';
import { trackEvent } from '../telemetry/trackEvent';
import {
  consumeOnlineSeatLightningAfterSuccess,
  getOnlineSeatLightningByLnurlpId,
} from '../state/onlineSeatLightningState';
import {
  formatAnonSeatLabel,
  getRoomById,
  isRematchLoserSession,
  listOnlineRooms,
  seatPaidPlayer,
  serializeRoom,
  settleOnlineRematchPayment,
} from '../state/onlineRoomState';

const router = Router();
dotenv.config();

interface LNURLPReqBody {
  payment_hash: string;
  payment_request: string;
  amount: number;
  comment: string | string[] | null;
  webhook_data: string;
  lnurlp: string;
  body: string;
}

function ipFilter(
  req: Request,
  res: Response,
  next: (err?: ExtendedError) => void
) {
  const nolmalizedIP = req.headers['x-real-ip'];
  const allowedServerIp = process.env.LNBITS_IP;
  if (nolmalizedIP === allowedServerIp) {
    next();
  } else {
    res.status(403).send('Access denied');
  }
}

router.post('/', ipFilter, async (req: Request, res: Response) => {
  const reqBody = req.body as LNURLPReqBody;
  const reqLNURLP = reqBody.lnurlp;

  if (!reqLNURLP) {
    console.error(`${dateNow()} LNURLp not sent.`);
    res.status(404).send('LNURLp not sent.');
    return;
  }

  const onlineRec = getOnlineSeatLightningByLnurlpId(reqLNURLP);
  if (onlineRec) {
    const amountSats = Math.floor(reqBody.amount / 1000);
    if (amountSats < onlineRec.buyin) {
      console.error(
        `${dateNow()} [ONLINE_SEAT_LN] amount too low lnurlp=${reqLNURLP} got=${amountSats} min=${onlineRec.buyin}`
      );
      trackOnlineReject('online.seat.pay_rejected', 'amount_too_low', {
        sessionID: onlineRec.sessionID,
        roomId: onlineRec.roomId,
        amountSats,
      });
      res.status(400).send('amount_too_low');
      return;
    }
    if (amountSats !== onlineRec.buyin) {
      console.error(
        `${dateNow()} [ONLINE_SEAT_LN] amount mismatch lnurlp=${reqLNURLP} got=${amountSats} expected=${onlineRec.buyin}`
      );
      res.status(400).send('amount_mismatch');
      return;
    }
    const room = getRoomById(onlineRec.roomId);
    if (!room) {
      consumeOnlineSeatLightningAfterSuccess(reqLNURLP);
      await deleteLNURLP(reqLNURLP);
      res.status(404).send('room_not_found');
      return;
    }
    const isRematchPay =
      onlineRec.purpose === 'rematch' ||
      isRematchLoserSession(room, onlineRec.sessionID);
    let kind1EventId: string;
    let zapBuyinSats: number;
    if (isRematchPay) {
      if (room.phase !== 'postgame' || !room.postGame.rematchRequested) {
        res.status(400).send('room_not_accepting');
        return;
      }
      const requiredAmount = room.postGame.rematchRequiredAmount ?? 0;
      if (amountSats < requiredAmount) {
        console.error(
          `${dateNow()} [ONLINE_SEAT_LN] rematch amount too low lnurlp=${reqLNURLP} got=${amountSats} min=${requiredAmount}`
        );
        res.status(400).send('amount_too_low');
        return;
      }
      if (amountSats !== requiredAmount) {
        console.error(
          `${dateNow()} [ONLINE_SEAT_LN] rematch amount mismatch lnurlp=${reqLNURLP} got=${amountSats} expected=${requiredAmount}`
        );
        res.status(400).send('amount_mismatch');
        return;
      }
      if (!room.postGame.rematchEventId) {
        console.error(`${dateNow()} [ONLINE_SEAT_LN] rematch kind1 missing roomId=${room.roomId}`);
        res.status(400).send('kind1_not_ready');
        return;
      }
      kind1EventId = room.postGame.rematchEventId;
      zapBuyinSats = requiredAmount;
    } else {
      if (room.phase !== 'lobby' || room.postGame.rematchRequested) {
        res.status(400).send('room_not_accepting');
        return;
      }
      if (!room.kind1EventId) {
        console.error(`${dateNow()} [ONLINE_SEAT_LN] kind1 missing roomId=${room.roomId}`);
        res.status(400).send('kind1_not_ready');
        return;
      }
      kind1EventId = room.kind1EventId;
      zapBuyinSats = onlineRec.buyin;
    }
    let zapContext: Awaited<ReturnType<typeof resolveOnlineSeatZapContext>>;
    try {
      zapContext = await resolveOnlineSeatZapContext(kind1EventId, zapBuyinSats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'zap_context_failed';
      if (msg === 'host_ln_unknown') {
        console.error(
          `${dateNow()} [ONLINE_SEAT_LN] missing Kind1 author lud16 for zap LNURL roomId=${room.roomId} kind1=${kind1EventId}`
        );
        res.status(400).send('host_lnaddress_missing');
        return;
      }
      if (msg === 'recipient_lnurl_no_zap') {
        res.status(400).send('recipient_lnurl_no_zap');
        return;
      }
      console.error(
        `${dateNow()} [ONLINE_SEAT_LN] kind1 not found roomId=${room.roomId} kind1=${kind1EventId} err=${msg}`
      );
      res.status(400).send('kind1_not_found');
      return;
    }
    const hostLud16 = zapContext.hostLud16;
    const kind1AuthorPubkey = zapContext.kind1AuthorPubkey;
    let skBytes: Uint8Array;
    try {
      skBytes = hexToBytes(onlineRec.zapSecretKeyHex);
    } catch {
      res.status(500).send('invalid_zap_key');
      return;
    }
    const zapResult = await requestZapInvoiceAndPayForKind1({
      kind1EventId,
      kind1AuthorPubkey,
      buyinSats: zapBuyinSats,
      zapSecretKeyBytes: skBytes,
      hostLud16,
    });
    consumeOnlineSeatLightningAfterSuccess(reqLNURLP);
    await deleteLNURLP(reqLNURLP);
    if (!zapResult.ok) {
      console.error(
        `${dateNow()} [ONLINE_SEAT_LN] zap publish failed after LN pay reason=${zapResult.reason} roomId=${room.roomId}`
      );
      res.status(500).send(zapResult.reason);
      return;
    }
    console.log(
      `${dateNow()} [ONLINE_SEAT_LN] LN settled; zap invoice paid for kind1=${kind1EventId} session=${onlineRec.sessionID.slice(0, 8)}… (${isRematchPay ? 'rematch' : 'seat'})`
    );
    trackOnlineOk('online.seat.paid', {
      sessionID: onlineRec.sessionID,
      pubkeyPrefix: resolveTrackPubkeyPrefix(onlineRec.sessionID, onlineRec.roomId),
      roomId: onlineRec.roomId,
      amountSats: zapBuyinSats,
      meta: { method: 'lightning', rematch: isRematchPay },
    });
    if (isRematchPay) {
      const rematch = settleOnlineRematchPayment({
        roomId: onlineRec.roomId,
        amount: zapBuyinSats,
        payerPubkey: onlineRec.zapPubkeyHex,
      });
      if (!rematch.ok) {
        console.error(
          `${dateNow()} [ONLINE_SEAT_LN] rematch settle failed after LN pay roomId=${onlineRec.roomId} reason=${rematch.reason}`
        );
      } else {
        io.to(onlineRec.roomId).emit('onlineRoomUpdated', serializeRoom(rematch.room));
        io.emit('resListOnlineRooms', { rooms: listOnlineRooms() });
        if (rematch.matchStarted) {
          void import('../socket/onlineRoom').then(({ publishOnlineMatchStarted }) =>
            publishOnlineMatchStarted(onlineRec.roomId, onlineRec.sessionID)
          );
        }
      }
    } else {
      const seatResult = seatPaidPlayer({
        roomId: onlineRec.roomId,
        sessionID: onlineRec.sessionID,
        socketID: onlineRec.socketID,
        amount: zapBuyinSats,
        name: formatAnonSeatLabel(onlineRec.zapPubkeyHex),
        pubkey: onlineRec.zapPubkeyHex,
        payMethod: 'lightning',
      });
      if (!seatResult.ok) {
        console.error(
          `${dateNow()} [ONLINE_SEAT_LN] seat assign failed after LN pay roomId=${onlineRec.roomId} reason=${seatResult.reason}`
        );
      } else {
        io.to(onlineRec.roomId).emit('onlineSeatAssigned', {
          roomId: onlineRec.roomId,
          playerRole: seatResult.role,
          sessionId: onlineRec.sessionID,
        });
        io.to(onlineRec.roomId).emit('onlineRoomUpdated', serializeRoom(seatResult.room));
        io.emit('resListOnlineRooms', { rooms: listOnlineRooms() });
        if (seatResult.matchStarted) {
          void import('../socket/onlineRoom').then(({ publishOnlineMatchStarted }) =>
            publishOnlineMatchStarted(onlineRec.roomId, onlineRec.sessionID)
          );
        }
      }
    }
    res.status(200).send('OK');
    return;
  }

  const sessionID = getIDFromLNURLP(reqLNURLP);
  if (!sessionID) {
    console.error(`${dateNow()} Session ID not found.`);
    res.status(404).send('Session ID not found.');
    return;
  }

  const amount = reqBody.amount / 1000;
  const comment = normalizePaymentComment(reqBody.comment);
  console.log(
    `${dateNow()} [${sessionID}] Paid LNURLp ${reqLNURLP} with ${amount} sats and note ${comment}.`
  );
  const LNURLPs = getLNURLPsFromID(sessionID);
  if (LNURLPs) {
    const lnurlp = LNURLPs.find((lnurlp) => lnurlp.id === reqLNURLP);
    if (!lnurlp) {
      console.error(
        `${dateNow()} [${sessionID}] LNURLp ${reqLNURLP} not found for session.`
      );
      res.status(404).send('LNURLp not found for session.');
      return;
    }
    trackEvent({
      event: 'deposit.paid',
      outcome: 'ok',
      sessionID,
      amountSats: amount,
      meta: { gameMode: String(lnurlp.mode) },
    });
    const playerRole = decidePlayerRole(lnurlp, sessionID);
    if (!playerRole) {
      console.error(`${dateNow()} [${sessionID}] Player role not created.`);
      res.status(404).send('Player role not created.');
      return;
    }
    const playerInfos = getPlayerInfoFromIDToGame(sessionID, playerRole);
    const value = playerInfos?.value ?? 0;
    const prevName = playerInfos?.name ?? null;
    const prevPayments = playerInfos?.payments ?? [];
    const playerName = comment ?? prevName ?? playerRole;
    const payment: Payment = { amount: amount, note: comment };
    const playerInfo: PlayerInfo = {
      name: playerName,
      value: value + amount,
      payments: [...prevPayments, payment],
    };
    const newPlayerInfo = new Map<PlayerRole, PlayerInfo>();
    newPlayerInfo.set(playerRole, playerInfo);
    const gameMode = lnurlp.mode as GameMode;
    const gameInfo: GameInfo = {
      mode: gameMode,
      players: newPlayerInfo,
    };
    setGameInfoByID(sessionID, gameInfo);
    // Splits must run even when no socket is connected (UI missed update otherwise).
    paySplits(sessionID, amount, lnurlp.hostLNAddress);
    // Fan-out by session room (middleware joins each socket to marspay:session:<id>).
    // Relying only on IDToSocket + socket.id missed cases where the map was empty/stale.
    const sessionRoom = sessionSocketRoomName(sessionID);
    io.to(sessionRoom).emit('updatePayments', serializeGameInfoFromID(sessionID));
    const roomSize = io.sockets.adapter.rooms.get(sessionRoom)?.size ?? 0;
    if (roomSize === 0) {
      console.warn(
        `${dateNow()} [${sessionID}] updatePayments emitted to session room but no socket joined (client offline); UI will catch up on reconnect / getPracticeMenuInfos`
      );
    }
    res.status(200).send('OK');
  }
});

function normalizePaymentComment(comment: string | string[] | null): string | null {
  if (comment == null) return null;
  const joined =
    typeof comment === 'string'
      ? comment
      : comment.map((part) => String(part ?? '')).join('');
  const withoutControlChars = [...joined]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  // Keep full user-provided name, while removing control chars and normalizing whitespace.
  const normalized = withoutControlChars
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized === '') return null;
  return normalized.slice(0, 64);
}

function paySplits(sessionID: string, amount: number, hostLNAddress?: string) {
  const devLN = process.env.DEVELOPER_LNADDRESS;
  const designerLN = process.env.DESIGNER_LNADDRESS;
  const hostLN = hostLNAddress ? hostLNAddress : process.env.HOST_LNADDRESS;
  const devPercent = DEVPERCENT;
  const designerPercent = DESIGNERPERCENT;
  const hostPercent = HOSTPERCENT;
  if (!devLN || !designerLN || !hostLN) {
    console.error(`${dateNow()} [${sessionID}] Split address is missing.`);
  }
  const feeSplit: Split[] = [
    { lnaddress: devLN!, percent: devPercent, role: 'developer' },
    { lnaddress: hostLN!, percent: hostPercent, role: 'host' },
    { lnaddress: designerLN!, percent: designerPercent, role: 'designer' },
  ];
  for (const split of feeSplit) {
    const splitedAmount = Math.floor(amount * split.percent);
    console.log(
      `${dateNow()} [${sessionID}] Sending ${
        split.percent
      } split of ${splitedAmount} sats to ${split.role} at ${split.lnaddress}`
    );
    paySplit(split.lnaddress as string, splitedAmount).catch((error) => {
      console.log(
        `${dateNow()} [${sessionID} Couldn't send split to ${split.role}: ${
          error.message
        }`
      );
    });
  }
}

async function paySplit(lnAddress: string, satsAmount: number) {
  const [userLN, domainLN] = lnAddress.split('@');
  const LNurl = `https://${domainLN}/.well-known/lnurlp/${userLN}`;

  const callback = await getLNURLCallback(LNurl);
  const invoice = await getInvoiceFromCallback(callback, satsAmount);
  await payInvoice(invoice);
}

function decidePlayerRole(lnurlp: LNURLP, sessionID: string) {
  if (lnurlp.mode == GameMode.P2P || lnurlp.mode == GameMode.PRACTICE) {
    return lnurlp.description as PlayerRole;
  } else {
    // if (lnurlp.mode == GameMode.TOURNAMENT)
    const gameInfos = getGameInfoFromID(sessionID);
    if (!gameInfos) {
      console.error(`${dateNow()} [${sessionID}] GameInfo not found.`);
      return;
    }
    const assignedRoles = [...gameInfos.players.keys()];
    const allRoles = Object.values(PlayerRole).slice(
      0,
      gameInfos.numberOfPlayers ?? 1
    );
    const availableRoles = allRoles.filter(
      (role) => !assignedRoles.includes(role as PlayerRole)
    );
    if (availableRoles.length === 0) {
      console.error(`${dateNow()} [${sessionID}] No available player roles.`);
      return;
    }
    return availableRoles[
      Math.floor(Math.random() * availableRoles.length)
    ] as PlayerRole;
  }
}

export default router;
