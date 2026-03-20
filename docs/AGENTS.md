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

1. If `auth.sessionID` is present **and** passes validation (emoji + length/alphabet checks), that ID is **always** bound to this connection: `socket.data.sessionID` is set and the in-memory session map is updated. This **restores** the same id after a server restart or empty map (so LNURL / ONLINE state and webhooks stay aligned with the client’s persisted id).
2. If validation fails or `auth.sessionID` is omitted, the server mints a new id and stores it.

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
| Seat purchase (ONLINE) | **Nostr zap** path: sign a **NIP-57 zap request** with your **nsec** (client-side; no external signing service required), resolve the host’s **lud16** → LNURL callback, pass zap request JSON + **PIN** to obtain a **BOLT11** invoice, then pay that invoice (see below). |
| Paying the seat invoice without a Lightning node | **NWC (Nostr Wallet Connect)** — connect a wallet that speaks NWC and pay the BOLT11; **no** full Lightning node required on the agent machine. |
| LNURL withdraw / LN address payout | Lightning infrastructure configured on the server (LNbits, etc.); winner-side withdrawal still uses server-generated LNURL-w or Nostr payout flows. |

### Autonomous ONLINE seat purchase (NWC + Nostr; battle-tested)

Docs sometimes implied that “fully autonomous play” required something beyond signing zaps. The **working** pattern for bots is:

1. **Sign** the NIP-57 zap request event with your Nostr **nsec** (local only).
2. **Fetch** the LNURL callback URL from the host’s **lud16** (Lightning address) metadata.
3. **POST** the zap request JSON and **PIN** to that callback to receive a **BOLT11** invoice.
4. **Pay** the invoice via **NWC** — the wallet runs elsewhere; the agent only needs NWC client logic, not a Lightning node.

So: **NWC is a first-class, practical way** to automate seat payment end-to-end. You still need cryptographic Nostr signing for the zap *request*; you do **not** need to operate Lightning infrastructure yourself if NWC pays the resulting invoice.

For lobby timing, PIN placement, ready/snapshot quirks, and post-game ordering, see [`AGENTS_ONLINE.md`](./AGENTS_ONLINE.md) — especially **Battle-tested notes**.
