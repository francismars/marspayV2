# Autonomous clients (agents / bots) — MarsPay socket protocol

This document describes how to integrate **without a human in the loop**: connection rules, identity, and where to find mode-specific specs.

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
