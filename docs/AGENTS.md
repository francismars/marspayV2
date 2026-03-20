# Autonomous clients (agents / bots) — MarsPay socket protocol

This document describes how to integrate **without a human in the loop**: connection rules, identity, and where to find mode-specific specs.

---

## What MarsPay is playing (Chain Duel)

**Chain Duel** is a competitive **Lightning-staked** arcade game: two players each pay a **buy-in** (sats, often via Nostr zap in ONLINE). Those stakes become **in-game points** on a shared **zero-sum pool** (`totalPoints`). The match runs until one side’s points drop to **zero**; the other player **wins** and can claim the net pot (minus server fee) through the post-game payout flow.

**Core loop (authoritative ONLINE rules, implemented in `marspayTS/src/game/onlineEngine.ts`):**

1. **Grid** — Discrete board (currently **51 x 25** cells). Each player is a **snake-like chain** (head + body segments).
2. **Movement** — You choose a **direction** (`Up` / `Down` / `Left` / `Right`). The server applies **snake-style** rules: you request a *wanted* direction each tick; invalid reversals are ignored according to current facing (see ONLINE doc for pre-start vs in-match behavior).
3. **Coinbases** — Neutral objects on the grid. **Eating** one (head on same cell) **transfers** sats from the opponent’s score into yours. The **transfer size** is a **percentage of `totalPoints`**, and that percentage **grows with your chain length** (from **2%** up to **32%** in defined length bands). Some coinbases carry a fixed **reward tier** (2 / 4 / 8 / 16 / 32) used in the same formula.
4. **Collisions** — Hitting the **wall**, your **own** body, the **enemy** body, or **head-to-head** does **not** end the round by itself: the affected snake(s) **reset** to their spawn side and **capture %** drops back toward the minimum. The **round** ends only when **either `score[0]` or `score[1]` reaches 0**.
5. **Economy bar** — `snapshot.hud` exposes **current points** and **bar widths** as fractions of the pool so UIs (and bots) can see who is ahead without re-deriving from raw state.

**What you send over the wire** is not “a move” but **held keys**: `roomInput` with booleans `up` / `down` / `left` / `right` (see [`AGENTS_ONLINE.md`](./AGENTS_ONLINE.md)). The sim reads those every **100 ms** tick.

For **full ONLINE** lifecycle (lobby, zaps, PIN, ready, snapshots, post-game), read [`AGENTS_ONLINE.md`](./AGENTS_ONLINE.md), especially **Game rules (authoritative ONLINE)**.

---

**Canonical TypeScript mirrors** of server payloads live in:

`chain-duel/chain-duel-react/src/types/socket.ts`

Backend handlers are registered in `marspayTS/src/socket/index.ts`.

---

## Transport

- **Socket.IO** (WebSocket with HTTP fallback) to the MarsPay server URL your deployment exposes.
- Use the **same event names and payload shapes** as the React client types above.

---

## Session identity (`sessionID`)

On connect, send Socket.IO auth:

```ts
const socket = io(SERVER_URL, {
  auth: { sessionID: optionalExistingSessionId },
});
```

### Rules (see `marspayTS/src/socket/middleware.ts`)

1. If `auth.sessionID` is present **and** passes validation **and** the server still maps it to an active socket session, that ID is **reused**.
2. Otherwise the server mints a new ID and stores it.

### Format

- `emoji:randomPart`
- `emoji` must be one of `ALLOWEDEMOJIS` (`marspayTS/src/consts/emojis.ts`).
- `randomPart` length = `SESSIONIDLENGHT` (**11** chars), alphabet = nanoid `nolookalikes` (`marspayTS/src/consts/values.ts`).

### Handshake event: `session`

Immediately after the middleware runs, the server emits:

```ts
socket.on('session', (data: { sessionID: string }) => { ... });
```

> **Note:** The shared frontend type may list `userID`; the current server only emits `sessionID`.

**Bots should:** persist `sessionID` locally and pass it on reconnect so seat ownership and game state mappings survive disconnects (especially for ONLINE paid seats).

---

## Socket.IO rooms (server-side)

The server joins sockets to an internal room named `room.roomId` for ONLINE broadcasts. Clients do **not** call `socket.join` themselves; joining happens when handling `createOnlineRoom`, `joinOnlineRoom`, `spectateOnlineRoom`, etc.

---

## Errors and “success” signals

- There is **no single global error event**. Each game mode uses its own pattern.
- **ONLINE** uses `onlinePinInvalid` for many failure cases (naming is historical; not PIN-only). See [`AGENTS_ONLINE.md`](./AGENTS_ONLINE.md).

---

## Reconnect checklist (ONLINE)

1. Reconnect with the **same** `sessionID` in `auth`.
2. Re-join the game room: `joinOnlineRoom` / `joinOnlineRoomByCode` / `spectateOnlineRoom` / `getOnlineRoomState` as appropriate.
3. Re-subscribe to `onlineRoomUpdated` and (while playing) `onlineRoomSnapshot`.
4. If you had a paid seat, the server keeps the seat across transient disconnects unless the client explicitly releases it (see ONLINE doc).

---

## Mode-specific specs

| Mode    | Document |
|---------|----------|
| ONLINE  | [`AGENTS_ONLINE.md`](./AGENTS_ONLINE.md) |
| P2P / Tournament / Nostr menus | Use `ClientToServerEvents` / `ServerToClientEvents` in `socket.ts`; handlers under `marspayTS/src/socket/`. |

---

## Autonomy vs external systems

| Capability | Typical requirement |
|------------|---------------------|
| Socket API (lobby, snapshots, inputs) | MarsPay server + valid `sessionID` |
| Seat purchase (ONLINE) | **Nostr zap** to the room’s Kind1 (or rematch) invoice with correct amount + PIN in comment |
| LNURL withdraw / LN address payout | Lightning infrastructure configured on the server (LNbits, etc.) |

Fully autonomous play still needs a process that can **sign Nostr zaps** (or use a pre-funded custodial flow if you add one).
