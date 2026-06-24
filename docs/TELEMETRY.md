# Telemetry

Structured funnel and ops tracking for marspay. Events emit as JSON lines to stdout (`"type":"track"`), persist to `data/telemetry/events.jsonl`, and roll up into counters and the admin dashboard.

## Admin dashboard

After `npm run build`, open:

```
http://localhost:3001/dashboard
```

Sign in with `ADMIN_PASSWORD` from `.env` (httpOnly cookie session; no password in URL).

### API endpoints (cookie auth)

| Route | Purpose |
|-------|---------|
| `POST /dashboard/api/login` | `{ "password": "…" }` → session cookie |
| `POST /dashboard/api/logout` | Clear session |
| `GET /dashboard/api/me` | `{ authenticated: boolean }` |
| `GET /dashboard/api/overview` | KPI cards |
| `GET /dashboard/api/funnels` | Challenge, ONLINE, client funnel breakdowns |
| `GET /dashboard/api/challenges` | Win/replay stats, claims, bounty budget |
| `GET /dashboard/api/online` | Live rooms + match history |
| `GET /dashboard/api/activity?limit=100&event=challenge.&outcome=ok` | Recent track events |
| `GET /dashboard/api/sessions` | Connected sessions |
| `GET /dashboard/api/debug/raw` | Legacy full in-memory dump (LNURL maps, etc.) |

Legacy: `GET /dashboard?password=…` returns overview JSON with `Deprecation: true` header.

### Local dev

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — admin UI (proxies /dashboard/api to :3001)
cd admin && npm run dev
```

Or build and serve from marspay:

```bash
npm run build && npm start
```

### Verify after deploy

```bash
# Login and overview
curl -c /tmp/dash.cookie -X POST http://127.0.0.1:3001/dashboard/api/login \
  -H 'Content-Type: application/json' -d '{"password":"YOUR_ADMIN_PASSWORD"}'
curl -b /tmp/dash.cookie http://127.0.0.1:3001/dashboard/api/overview | jq .

# Track events in logs and on disk
grep '"type":"track"' logs/marspay-out.log | tail -5 | jq .
tail -3 data/telemetry/events.jsonl | jq .

# Or use the verification script
./scripts/verify-dashboard.sh
```

**Security:** Restrict `/dashboard` to localhost or VPN in nginx. Do not expose publicly without TLS and a strong `ADMIN_PASSWORD`.

## Event catalog

### Challenge bounty

| Event | When |
|-------|------|
| `challenge.eligibility` | After eligibility check |
| `challenge.run` | Challenge run requested |
| `challenge.win.submit` | Win submission received |
| `challenge.win.replay` | Replay validation result |
| `challenge.win.token` | Claim token issued |
| `challenge.claim` | Bounty claim attempt |
| `challenge.zap.retry` | Zap retry |

Human tags: `[CHALLENGE_START]`, `[CHALLENGE_ELIGIBILITY]`, plus existing `[CHALLENGE_WIN]` / `[CHALLENGE_CLAIM]`.

### Session and Nostr

| Event | When |
|-------|------|
| `session.connected` | Socket session accepted |
| `session.disconnected` | Socket disconnect |
| `nostr.app.link` | App Nostr session linked |

Human tags: `[SESSION_CONNECT]`, `[SESSION_DISCONNECT]`, `[NOSTR_SIGNIN]`.

### ONLINE

| Event | When |
|-------|------|
| `online.room.created` | Room created |
| `online.room.joined` | Join by room id |
| `online.room.joined_code` | Join by code |
| `online.room.spectate` | Spectator joined |
| `online.room.cancelled` | Host cancelled room |
| `online.seat.lightning.requested` | Seat LNURL requested |
| `online.seat.ready` | Ready toggled |
| `online.game.started` | Match started |
| `online.game.finished` | Match archived |
| `online.payout.withdrawal` | LNURL-w payout |
| `online.payout.nostr` | Nostr zap payout |
| `online.rematch.vote` | Double-or-nothing vote |
| `online.seat.paid` | Seat payment confirmed |
| `online.seat.pay_rejected` | Seat payment rejected |
| `online.ping.reported` | Aggregated latency sample |

### Payments (P2P / practice / tournament)

| Event | When |
|-------|------|
| `deposit.paid` | LNURL-pay webhook (non-ONLINE seat) |

### Client beacons (`source: client`)

| Event | When |
|-------|------|
| `client.page.view` | Route change |
| `client.funnel.abandon` | Lobby left without pay/ready |
| `client.ui.error` | Surfaced UI error |

## Persistence

| File | Contents |
|------|----------|
| `data/telemetry/events.jsonl` | Append-only track event log (rotates at ~50MB) |
| `data/telemetry/challenge_stats.json` | Win/replay counters |
| `data/telemetry/counters.json` | Funnel counter rollup |
| `data/challenge_claims/claims.jsonl` | Paid bounty audit |
| `data/online_archive/index.jsonl` | ONLINE match index |

All under `data/` are gitignored.

## Privacy

Track events use `pubkeyPrefix` (12 hex chars) only. No nsec, NWC URIs, lud16, or replay payloads.
