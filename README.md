# MarsPay V2

**Reusable Lightning backend** for **1v1 games** (and similar match formats). Plug in **your own frontend** — web, mobile, or bot — as long as it speaks the **Socket.IO** contract. The server handles **LNbits** LNURL pay and withdraw, **Nostr** zaps and Kind1 flows (via NDK), and **session + game state** so stakes, admissions, and payouts stay consistent.

**Chain Duel** is the reference game that ships alongside this repo; the same stack is meant to support **other projects** that need paid lobbies, duels, tournaments, or ONLINE-style matches without rebuilding Lightning plumbing.

## What this project does

- **Matchmaking and sessions** — Each client gets a stable `sessionID` (see [docs/AGENTS.md](docs/AGENTS.md)) so reconnects and seat claims can be tied to the same player.
- **Lightning money flow** — LNURLp (deposits / buy-ins) and LNURLw (winner withdrawals) through LNbits, plus webhooks when payments settle.
- **Nostr** — Kind1 game notes, zap receipts for admissions and ONLINE seat purchase (PIN-in-comment flow), and related replies depending on mode.
- **Authoritative ONLINE play** — For ONLINE rooms, the **game simulation runs on the server** (see `src/game/onlineEngine.ts` — today a tick-based arena game; you can treat this as the **pattern** for other authoritative modes). Clients send inputs and render snapshots.

**Integrating your own client:** Implement the events and payloads described in [docs/AGENTS.md](docs/AGENTS.md) and [docs/AGENTS_ONLINE.md](docs/AGENTS_ONLINE.md). A TypeScript mirror of socket types exists in the Chain Duel React app for reference (`chain-duel/chain-duel-react/src/types/socket.ts` when that repo is checked out next to this one).

## Features (high level)

| Area | Notes |
|------|--------|
| Socket.IO | Real-time menus, duels, tournaments, P2P / Nostr variants, **ONLINE** rooms, post-game and withdrawals. |
| HTTP | LNbits callbacks: `POST /api/LNURL/paid`, `POST /api/LNURL/withdrawn`; static `public/`, optional `dashboard`. |
| State | In-memory session, game, LNURL, and ONLINE room state (see `src/state/`). |
| NDK | Nostr subscriptions and publishing from `src/calls/NDK/`. |

## Tech stack

- **Node.js**, **TypeScript**, **Express** (HTTP)
- **Socket.IO** (WebSocket)
- **@nostr-dev-kit/ndk** (Nostr)
- **LNbits**-style hooks for LNURL

## Repository layout

```
src/
  server.ts          # HTTP server + Socket.IO bootstrap
  app.ts             # Express routes (LNURL webhooks, static, dashboard)
  socket/            # All Socket.IO event handlers (game, tournament, ONLINE, …)
  routes/            # LNURL paid / withdrawn HTTP handlers
  calls/             # LNbits API, LN address, NDK publish/subscribe
  state/             # Session, game, ONLINE room, nostr, etc.
  game/              # ONLINE authoritative simulation (tick loop consumes this)
```

## Setup

```bash
git clone https://github.com/francismars/marspayV2.git
cd marspayV2
npm install
npm run dev
```

- **Dev:** `npm run dev` (nodemon + `src/server.ts`) — **http://localhost:3001** (override with `PORT` in `.env`)
- **Production:** `npm run build` then `npm start` (runs `dist/server.js`)

## Environment

Copy [`.env.example`](.env.example) to `.env` and fill in values from your LNbits deployment:

```bash
cp .env.example .env
```

See [docs/AGENTS_CHALLENGE_BOUNTY.md](docs/AGENTS_CHALLENGE_BOUNTY.md) for challenge-specific vars (`CHAINDUEL_NOSTR_PUBKEY`, `CHALLENGE_BOUNTY_DAILY_CAP_SATS`, `NOSTR_PK`).

## API and documentation

- **Autonomous clients / bots:** [docs/AGENTS.md](docs/AGENTS.md) (sessions, reconnect)
- **ONLINE mode (zap, PIN, snapshots, payouts):** [docs/AGENTS_ONLINE.md](docs/AGENTS_ONLINE.md)
- **Built-in ONLINE game rules (reference implementation):** [docs/AGENTS_ONLINE.md](docs/AGENTS_ONLINE.md) — authoritative rules section

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server with reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run lint` | ESLint on `src/` |

## License

MIT

## Contributing

Issues and pull requests are welcome.
