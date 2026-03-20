# ONLINE mode — agent protocol (Socket.IO + Nostr zap)

This document matches **`marspayTS` as implemented**: `src/socket/onlineRoom.ts`, `src/state/onlineRoomState.ts`, `src/game/onlineEngine.ts`, and zap handling in `src/calls/NDK/subscribeEvent.ts`.

Types: `chain-duel/chain-duel-react/src/types/socket.ts` (`OnlineRoomState`, `OnlineRoomSnapshot`, …).

---

## Game rules (authoritative ONLINE)

This is what the server actually simulates (`src/game/onlineEngine.ts`). Clients and bots should **treat `onlineRoomSnapshot` as truth**, not re-simulate unless fuzz-testing.

### Stakes and win condition

- Each seat’s paid amount (and buy-in defaults) set **`initialScore` / `score`** and **`totalPoints`** = sum of both players’ starting points. **Scores always stay between 0 and `totalPoints`**; taking from one side adds to the other (zero-sum pool).
- **Match ends** when **`score[0] <= 0` or `score[1] <= 0`** after a tick (`gameEnded` becomes true; winner is the player still above zero). There is no time limit in engine code beyond room-level cleanup elsewhere.

### Map and entities

- **Grid:** `state.cols` x `state.rows` (implementation constants: **51** columns, **25** rows). Origin and bounds checks use integer cell indices; going out of bounds **resets** that snake (see below).
- **Snakes:** `state.p1` / `state.p2` each have `head`, `body` (chain behind the head), `dir` (current), `dirWanted` (requested).
- **Coinbases:** `state.coinbases[]` each have `pos: [x, y]` and optional `reward` (2, 4, 8, 16, or 32). Eating removes that coinbase and may spawn another at a random empty cell.

### Movement and input (`roomInput`)

- During **`playing`**, each tick the server reads **boolean held directions** per paid player from `inputBySession` and maps them with `setOnlineWantedDirection` (only one direction “wins” per tick depending on which keys are true).
- **After the match has started (`gameStarted`):** turns are constrained so you **cannot flip into illegal reversals** relative to current `dir` (classic snake-style: from `Up`/`Down` you may only switch to `Left`/`Right`, etc.). **P1** and **P2** have slightly different allowed transitions when `dir` is empty at the very start of motion.
- **Before `gameStarted` (pre-countdown / lineup):** only **P1 → Right** and **P2 → Left** are accepted as `dirWanted` so both face inward.
- Then a **countdown** runs (`countdownStart`, `countdownTicks`); when it completes, **`gameStarted`** becomes true and snakes begin stepping every tick.

### Eating a coinbase (scoring)

- When a **head** occupies the same cell as a coinbase, that player **gains** points and the opponent **loses** the same amount.
- Transfer amount = `floor(totalPoints * percent / 100)` with a **minimum of 1** sat (as implemented).
- **Percent** for a normal coinbase comes from **your snake length** (head + body segments), using bands:

| Chain length (segments) | Capture % of `totalPoints` |
|-------------------------|----------------------------|
| 1                       | 2%                         |
| 2–3                     | 4%                         |
| 4–6                     | 8%                         |
| 7–10                    | 16%                        |
| 11+                     | 32%                        |

- If the coinbase has **`reward`** (2 / 4 / 8 / 16 / 32), that value is used as the **percent** in the same formula instead of the length-based table.
- The eater’s **body grows** by one segment. **`currentCaptureP1` / `currentCaptureP2`** strings in `snapshot.state` (and HUD capture labels) reflect the **current** capture percent for that snake.

### Collisions (death / reset, not match end)

- **Head vs head** on the same cell: **both** snakes reset to default spawn poses and default wanted direction (P1 right, P2 left); capture labels reset to **2%**.
- **Head out of bounds** or **head vs any body segment** (self or enemy): that snake **resets** the same way.
- After reset, play continues until someone’s **score hits 0**.

### HUD and reading a snapshot

- **`snapshot.hud`:** `p1Points` / `p2Points` mirror `state.score`. **Widths** (`initialWidthP*`, `currentWidthP*`) are the share of the bar (0–100) each side holds of the pool — useful for agents that don’t want to parse the full grid.
- **`snapshot.state`:** Full authoritative picture: snake geometry, coinbases, `gameStarted`, `gameEnded`, `winnerPlayer` (`'P1' | 'P2'`), `winnerName`, `score`, `totalPoints`, `pointChanges` (floating combat text metadata), etc.

### Tick rate

- Simulation advances on the server **every 100 ms** while the room phase is `playing`; each step emits **`onlineRoomSnapshot`**.

---

## Constants (implementation)

| Constant | Value | Location |
|----------|-------|----------|
| Simulation tick | **100 ms** | `ONLINE_TICK_MS` in `onlineRoom.ts` |
| Join PIN TTL | **2 min** | `PIN_TTL_MS` in `onlineRoomState.ts` |
| Join PIN format | **4 decimal digits** | `issueJoinPin` |
| Payout fee factor | **0.95** of winner points (floor) | `ONLINE_PAYOUT_MULTIPLIER` |
| Replay max frames | **3600** | `ONLINE_REPLAY_MAX_FRAMES` |
| Default minimum buy-in | **300** sats | `BUYINMIN` (`consts/values.ts`) |

---

## Phases

`OnlineRoomState.phase` / snapshot phase:

`lobby` → `playing` → `finished` → (optional) reset to `lobby` after double-or-nothing + rematch zap; or `cancelled` if host cancels with no paid seats.

---

## Happy path (two players + optional spectators)

1. **Connect** with Socket.IO; receive `session` with `sessionID` ([`AGENTS.md`](./AGENTS.md)).
2. **Host:** `createOnlineRoom` → `resCreateOnlineRoom` with `roomId`, `roomCode`, `joinPin`, `pinExpiresAt`, `room`, optional `nostrMeta` (after async Kind1 publish).
3. **Guest:** `joinOnlineRoomByCode` `{ roomCode }` or `joinOnlineRoom` `{ roomId }` → `resJoinOnlineRoom` (same shape as create response).
4. **Spectator:** `spectateOnlineRoom` `{ roomId }` (no dedicated response; room state via `onlineRoomUpdated`).
5. **Buy seat:** Zap the published Kind1 note (amount ≥ `nostrMeta.min` / Kind1 `min`) with the **join PIN** in the zap **content** (see [PIN & zap](#join-pin--nostr-zap-seat-claim)).
6. Server assigns next open `Player 1` / `Player 2` seat → `onlineSeatAssigned` + `onlineRoomUpdated` to `roomId`.
7. **Ready:** Each seated player sends `onlineSetReady` `{ roomId, ready: true }` (or `startOnlineGame` which forces `ready: true` for caller only). When **both** paid seats are `ready` and both `sessionID`s are present in `members`, phase becomes **`playing`** → `onlineRoomUpdated`.
8. **Play:** While `phase === 'playing'`, paid players send `roomInput` at your chosen rate (server ticks at 100 ms). Server broadcasts **`onlineRoomSnapshot`** every tick to the room.
9. **Finish:** Phase `finished` → `onlineRoomUpdated`; list rows gain `result` / `replay` metadata; Nostr reply may be published by server.
10. **Post-game:** `getOnlinePostGame` → `resOnlinePostGameInfo`. Winner may `createOnlineWithdrawal` or `createOnlineNostrPayout` under rules below.

---

## Client → server events (ONLINE)

| Event | Payload | Notes |
|-------|---------|--------|
| `createOnlineRoom` | `{ buyin?: number; hostLNAddress?: string }` | Requires `sessionID`. Host is spectator until zap. |
| `listOnlineRooms` | — | |
| `joinOnlineRoom` | `{ roomId: string }` | |
| `joinOnlineRoomByCode` | `{ roomCode: string }` | Code matched uppercase |
| `spectateOnlineRoom` | `{ roomId: string }` | |
| `leaveOnlineRoom` | `{ roomId?: string }` | If `roomId` given, leaves that socket.io room; always runs `leaveRoom(sessionID, { releaseSeat: true })` |
| `cancelOnlineRoom` | `{ roomId: string }` | Member only; **fails** if any seat is `paid` (`room_has_paid_seats`) |
| `getOnlineRoomState` | `{ roomId: string }` | Pushes `onlineRoomUpdated` to caller |
| `roomInput` | `{ roomId, input: { up?, down?, left?, right? } }` | **Only** while `playing`; caller must be paid player (by `sessionID` or `socket.id`) |
| `startOnlineGame` | `{ roomId: string }` | Sets caller’s seat `ready: true`; may start match; may emit `onlinePinInvalid` |
| `onlineSetReady` | `{ roomId: string; ready: boolean }` | Lobby only |
| `getOnlinePostGame` | `{ roomId: string }` | Re-joins room + updates socket mapping |
| `createOnlineWithdrawal` | `{ roomId: string }` | Winner only; LNURLw flow |
| `createOnlineNostrPayout` | `{ roomId: string }` | Winner only; needs `winnerLnAddress` on postgame |
| `onlineDoubleOrNothing` | `{ roomId: string }` | Both players vote; on agreement publishes rematch Kind1 |
| `getOnlineReplay` | `{ roomId: string }` | After finish, if replay recorded |

> **No `sessionID`:** Most handlers no-op silently (no response) if `socket.data.sessionID` is missing. `createOnlineRoom` returns early without emitting if there is no session.

---

## Server → client events (ONLINE)

| Event | Payload | When |
|-------|---------|------|
| `resCreateOnlineRoom` | `roomId`, `roomCode`, `joinPin`, `pinExpiresAt`, `nostrMeta?`, `room` | Host created |
| `resJoinOnlineRoom` | Same shape | Join by id/code |
| `resListOnlineRooms` | `{ rooms: OnlineRoomListItem[] }` | After `listOnlineRooms`; also **broadcast** `io.emit` when room list changes |
| `onlineRoomUpdated` | `OnlineRoomState` | Room membership, seats, phase, postgame fields, etc. |
| `onlineRoomSnapshot` | `{ roomId, snapshot: OnlineRoomSnapshot }` | Each **100 ms** tick while `playing` |
| `onlineSeatAssigned` | `{ roomId, playerRole, sessionId }` | After successful zap + seat assignment |
| `onlinePinInvalid` | `{ reason: string }` | Many failures (see table below) |
| `resOnlinePostGameInfo` | See `socket.ts` | Successful `getOnlinePostGame` |
| `resCreateOnlineWithdrawal` | `{ roomId, lnurlw: string }` | `lnurlw` may be `'pass'` if zero amount |
| `resCreateOnlineNostrPayout` | `{ roomId, lnAddress, amount, ok: boolean }` | Successful zap payout |
| `onlineDoubleOrNothingUpdate` | `{ roomId, votes, required: 2, agreed }` | After a valid vote |

---

## Join PIN & Nostr zap (seat claim)

### Issuance

- `joinPin` is issued on `createOnlineRoom` / `joinOnlineRoom` / `joinOnlineRoomByCode` (not on spectate).
- PIN is **4 digits**, TTL **2 minutes**, unless extended while still valid and user remains eligible (`shouldPinStayActive` in state).
- One PIN is **consumed** on first successful zap that matches it for that `roomId`.

### Zap comment parsing (`extractPinFromComment`)

- If the zap **content** (after trim) is exactly **4 digits**, that is the PIN.
- Otherwise the first **4-digit substring** in the content is used.

### Amount

- Must be **≥** Kind1 minimum (`nostrMeta.min` / published Kind1), or the server rejects with `amount_too_low`.

### Server routing

- Zap is matched to a room via `getRoomBySession(sessionID)` **or** `getRoomByKind1EventId`, where `sessionID` comes from the **Kind1 publisher** mapping (`getSessionIDfromKind1ID`), not from the zapper.

### Important quirk for agents

For several zap failures, `subscribeEvent.ts` emits `onlinePinInvalid` to `getSocketFromID(sessionID)` — the **Kind1 host session’s** current socket — **not** the zapper’s socket. Always reconcile state from **`onlineRoomUpdated` / `onlineRoomList`** as well, and do not assume error events arrive on the payer’s connection.

---

## `onlinePinInvalid.reason` catalog

| Reason | Typical source |
|--------|----------------|
| `room_not_found` | Bad `roomId` / code |
| `room_has_paid_seats` | `cancelOnlineRoom` blocked |
| `seats_not_filled` | `startOnlineGame` when second seat not paid |
| `postgame_unavailable` | `getOnlinePostGame` |
| `replay_unavailable` | `getOnlineReplay` |
| `only_winner_can_withdraw` | Withdraw / nostr payout |
| `rematch_pending` | Payout blocked while rematch flow active |
| `withdraw_started` | Payout already chosen / in progress |
| `lnurlw_create_failed` | LNbits failure |
| `winner_ln_missing` | Nostr payout without winner LN address |
| `zero_amount` | Nostr payout with zero computed amount |
| `nostr_payout_failed` | Pay invoice path threw |
| **Ready / lobby** | From `setSeatReady`: `room_not_ready`, `postgame_settled`, `not_paid_player` |
| **Zap / PIN** | `amount_too_low`, `pin_missing`, `not_found`, `room_mismatch`, `already_used`, `expired` |
| **Seat assignment** | `room_not_found`, `rematch_locked`, `seats_full` |
| **Double-or-nothing / rematch zap** | `room_not_finished`, `withdraw_started`, `rematch_pending`, `not_player`, rematch: `rematch_not_requested`, `amount_too_low`, `winner_unknown`, `seats_not_ready`, `not_loser`, `winner_cannot_match` |

---

## Match start conditions

`maybeStartReadyMatch` requires:

- `phase === 'lobby'`
- Both seats `status === 'paid'`
- Both seats `ready === true`
- Both `sessionID`s set and both present in `room.members`

`startOnlineGame` sets the caller ready then checks `areSeatsFilled`; if not filled, emits `seats_not_filled` but **still** broadcasts `onlineRoomUpdated`.

---

## Input and simulation

See **[Game rules (authoritative ONLINE)](#game-rules-authoritative-online)** for what those inputs *do* (snake movement, collisions, scoring).

- **Authoritative** state is server-side (`OnlineAuthoritativeState` in `onlineEngine.ts`).
- Clients should **render from `onlineRoomSnapshot`**, not predict long-term.
- `roomInput` sets **held directions** for that `sessionID`; the sim reads them each tick (`up`/`down`/`left`/`right` booleans).

---

## Disconnect behavior

`disconnect` handler calls `leaveRoom(sessionID)` **without** `releaseSeat: true`.

- **Paid** seats: seat kept; `socketID` cleared/`disconnectedAt` set; `roomIdBySession` kept so reconnect can remap.
- **Unpaid** / spectator: membership and unpaid seat bindings cleared.

Explicit **`leaveOnlineRoom`** passes `releaseSeat: true` and **frees** paid seats back to `open`.

---

## Post-game payouts

- **Withdraw:** `createOnlineWithdrawal` — winner only (`winnerSessionID` or winner’s `socketID`). Computes `floor(winnerPoints * 0.95)` sats, creates LNURLw (unless zero → `pass`).
- **Nostr payout:** `createOnlineNostrPayout` — requires stored `winnerLnAddress`, pays LN address via LNURL flow on server.

Both block if `rematchRequested` or payout already started (`lnurlw` or `payoutMethod === 'nostr_zap'`).

---

## Double-or-nothing & rematch

1. Each player sends `onlineDoubleOrNothing` while `phase === 'finished'` and no payout started.
2. When **both** sessions voted, `agreed: true` → server publishes rematch Kind1 (`publishOnlineRematchKind1`) and sets `rematchRequested`, amounts, waiting session, etc.
3. **Loser** zaps the **rematch** event (tagged `e` = `rematchEventId`) with ≥ `rematchRequiredAmount`; pubkey must match loser seat if seat has `pubkey`.
4. On success, room resets toward a new lobby round (`resetRoomToLobby`).

---

## Agent implementation tips

1. **State:** Treat `onlineRoomUpdated` as the lobby/postgame source of truth; use `onlineRoomSnapshot` only for high-frequency game frames.
2. **Idempotency:** Re-sending `roomInput` with the same held keys is normal; releasing keys matters.
3. **Room list:** Subscribe to `resListOnlineRooms` if you need global lobby UI (server uses `io.emit` on changes).
4. **Testing:** Log `reason` on every `onlinePinInvalid`; cross-reference the table above.

---

## File map

| Concern | File |
|---------|------|
| Handlers | `marspayTS/src/socket/onlineRoom.ts` |
| State machine | `marspayTS/src/state/onlineRoomState.ts` |
| Tick loop | `startOnlineLoop` in `onlineRoom.ts` |
| Zap → seat | `marspayTS/src/calls/NDK/subscribeEvent.ts` (`GameMode.ONLINE` branch) |
| Socket registration | `marspayTS/src/socket/index.ts` |
