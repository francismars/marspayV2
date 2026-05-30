# App-level Nostr session (marspay)

Hybrid model: the **browser** signs (NIP-07 / NIP-46 / nsec); **marspay** verifies events, reads/publishes on relays, and is the source of truth for “who is signed in” per Socket.IO `sessionID`.

Implementation: `src/state/nostrAppSessionState.ts`, `src/socket/nostrAppSession.ts`, `src/socket/nostrRelay.ts`, `src/calls/nostr/fetchNostrAppProfile.ts`.

Types: `chain-duel/chain-duel-react/src/types/socket.ts` (`ResAppNostrSession`, `ResNostrProfile`, `ResPublishNostrEvent`).

---

## App session vs room link

| Concept | TTL | Purpose |
|---------|-----|---------|
| **App session** | ~24 h (sliding on activity) | `sessionID` ↔ `nostrPubkey` + cached kind-0 profile. Used globally (Config, corner avatar, practice payouts). |
| **Room link** | ~15 min | `roomId:pubkey` ↔ `sessionID` for **online seat zap** without PIN in comment. See [AGENTS_ONLINE.md](./AGENTS_ONLINE.md). |

When `requestOnlineNostrLinkChallenge` runs and the socket already has a valid **app session** for the same pubkey, the server can **auto-register** the room link and emit `resOnlineNostrLinkOk` (no second kind-1 sign).

---

## Client → server (app session)

| Event | Payload | Notes |
|-------|---------|--------|
| `requestAppNostrLinkChallenge` | — | Requires `sessionID` |
| `confirmAppNostrLink` | `{ event }` | Kind **1**, `content` = challenge from `resAppNostrLinkChallenge` |
| `getAppNostrSession` | — | Pushes `resAppNostrSession` |
| `clearAppNostrSession` | — | Clears binding; emits cleared session |

## Server → client (app session)

| Event | Payload | When |
|-------|---------|------|
| `resAppNostrLinkChallenge` | `{ challenge, expiresAt }` | After challenge request |
| `resAppNostrSession` | `{ ok, pubkey?, profile?, expiresAt?, signerMode? }` | After confirm/clear/get; **also on socket connect** if session still valid |

`signerMode` is optional metadata: `'extension' | 'nip46' | 'nsec'` (client-reported at confirm time).

---

## Relay helpers (no client relays for content)

| Event | Payload | Server behavior |
|-------|---------|-----------------|
| `getNostrProfile` | `{ pubkey? }` | Defaults to app session pubkey; `fetchNostrProfileMetadata` → `resNostrProfile` |
| `publishSignedNostrEvent` | `{ event }` | `verifyEvent`; pubkey must match app session; NDK publish → `resPublishNostrEvent` |

Used for kind-0 display and client-signed kind-1 posts (e.g. practice bounty notes).

---

## Frontend contract (`chain-duel-react`)

- **Sign-in UI:** [Config](../chain-duel/chain-duel-react/src/pages/Config.tsx) only.
- **State:** `NostrSessionProvider` + `useNostrSession()` — mirrors `resAppNostrSession`; `localStorage` is cache only after server confirms.
- **After local sign-in:** `linkToServer(signerMode)` → challenge → sign → `confirmAppNostrLink`.
- **Do not** use `SimplePool` / `fetchLatestKind0Profile` in production UI paths; NIP-46 bunker WS remains client-side (signing transport only).
