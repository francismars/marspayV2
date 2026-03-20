# MarsPay V2

Backend service for **Chain Duel** and similar **1v1 Lightning games**. It connects players over **Socket.IO**, routes **LNbits** LNURL pay and withdraw flows, listens for **Nostr** zaps (via NDK), and keeps game and session state on the server so matches stay fair and payouts line up with what was paid in.

## What this project does

- **Matchmaking and sessions** — Each client gets a stable `sessionID` (see [docs/AGENTS.md](docs/AGENTS.md)) so reconnects and seat claims can be tied to the same player.
- **Lightning money flow** — LNURLp (deposits / buy-ins) and LNURLw (winner withdrawals) through LNbits, plus webhooks when payments settle.
- **Nostr** — Kind1 game notes, zap receipts for admissions and ONLINE seat purchase (PIN-in-comment flow), and related replies depending on mode.
- **Authoritative ONLINE play** — For ONLINE rooms, the **game simulation runs on the server** (tick-based snake / chain duel logic in `src/game/onlineEngine.ts`); clients send inputs and render snapshots.

Frontends (e.g. Chain Duel React) talk to this server over WebSocket events; type shapes are documented in-repo for bots and integrations.

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

- **Dev:** `npm run dev` (nodemon + `src/server.ts`) — **http://localhost:3000**
- **Production:** `npm run build` then `npm start` (runs `dist/server.js`)

## Environment

Create a `.env` file in the project root (values come from your LNbits deployment):

```
LNBITS_URL=
LNBITS_IP=
LNBITS_KEY=
LNBITS_DEPOSITHOOK=
LNBITS_WITHDRAWHOOK=
ADMIN_PASSWORD=
```

## API and documentation

- **Autonomous clients / bots:** [docs/AGENTS.md](docs/AGENTS.md) (sessions, reconnect)
- **ONLINE mode (zap, PIN, snapshots, payouts):** [docs/AGENTS_ONLINE.md](docs/AGENTS_ONLINE.md)
- **Game rules (Chain Duel ONLINE sim):** same ONLINE doc, section on authoritative rules

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
