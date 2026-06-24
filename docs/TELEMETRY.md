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
| `GET /dashboard/api/activity?limit=100&event=challenge.&outcome=ok&since=24h&sessionID=…&pubkeyPrefix=…&roomCode=…` | Recent track events |
| `GET /dashboard/api/live` | Connected sessions with Nostr identity + context |
| `GET /dashboard/api/live/recent?hours=24` | 24h attempt rollup by pubkey/session |
| `GET /dashboard/api/live/:sessionID` | Session detail + last 20 events |
| `GET /dashboard/api/sessions` | Alias for `/live` (backward compatible) |
| `GET /dashboard/api/funnels?window=lifetime\|24h\|7d` | Funnel breakdowns |
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
| `online.nostr.link` | Per-room Nostr seat link (kind-1 challenge) |
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
| `data/telemetry/traffic_daily.jsonl` | Daily unique sessions/visitors + country aggregates (7d retention) |
| `data/challenge_claims/claims.jsonl` | Paid bounty audit |
| `data/online_archive/index.jsonl` | ONLINE match index |

All under `data/` are gitignored.

## Privacy

Track events use `pubkeyPrefix` (12 hex chars) only. No nsec, NWC URIs, lud16, or replay payloads in `events.jsonl`.

### Dashboard identity policy

The admin dashboard (`/dashboard`, cookie auth) may show richer identity than the event log:

| Surface | What is shown |
|---------|----------------|
| **Live tab** | Avatar, display name, nip05, lud16, full npub/hex pubkey — only when the player has an active app Nostr session (`getAppNostrSession`) or ONLINE seat profile |
| **Challenge claims** | Full pubkey + npub + njump.me links (from `claims.jsonl`, admin API only) |
| **Activity log** | `pubkeyPrefix` (12 hex) only — same as `events.jsonl` |
| **Recent attempts (24h)** | Aggregated by `pubkeyPrefix` or `sessionID`; full profile joined only if session still connected |
| **Anonymous / Lightning-only** | Labelled `anon` + session ID; no cross-session tracking |

**Not collected in event logs:** Raw IP addresses are not persisted in `events.jsonl` or funnel counters. App Nostr sessions expire after 24h (`APP_NOSTR_TTL_MS`).

### Traffic analytics (dashboard ops)

Server-side traffic metrics for capacity planning and abuse detection. Collected on socket connect only; **not** written to `events.jsonl`.

| Metric | Definition |
|--------|------------|
| `uniqueSessions24h` | Distinct `sessionID` with ≥1 connect in rolling 24h (reconnects do not double-count) |
| `uniqueVisitors24h` | Distinct daily salted IP hash in rolling 24h (approximate; NAT/shared IPs collapse) |
| `topCountries24h` | Distinct sessions and visitors per country code |
| `countrySeries7d` | Per UTC day, sessions per country from `traffic_daily.jsonl` |

**Collected (admin API only):** country code (`CF-IPCountry` when present), salted IP hash in memory for uniqueness, `sessionID` in rolling buffer.

**Not collected:** raw IP on disk, city-level geo, device fingerprint, referrer/UTM, cross-site tracking, joining traffic to Nostr pubkey.

**Retention:** rolling 24h connect buffer in memory (lost on server restart); daily country aggregates on disk for 7 days (`TRAFFIC_ROLLUP_RETENTION_DAYS`).

**Cloudflare / nginx:** pass `CF-IPCountry` to marspay so country is not `unknown`:

```nginx
proxy_set_header CF-IPCountry $http_cf_ipcountry;
proxy_set_header X-Real-IP $remote_addr;
```

Env: `TRAFFIC_SALT` (hash salt), `TRAFFIC_ROLLUP_RETENTION_DAYS` (default 7). See `.env.example`.

Restrict `/dashboard` to localhost or VPN. `ADMIN_PASSWORD` grants access to full pubkeys in API responses.

### Metric audit (overview KPIs)

| Field | Actual window | Notes |
|-------|---------------|-------|
| `challengeRunsTotal` | Lifetime | Funnel counter since deploy |
| `challengeRuns24h` | Rolling 24h | Scanned from `events.jsonl` tail (cap 10k lines) |
| `bountyPaidTodaySats` | Calendar day (UTC date key) | From `challenge_claims` daily spend |
| `connectedSessions` | Live | In-memory socket map |
| `activeOnlineRooms` | Live | Rooms not in `finished` phase |
| `traffic.uniqueSessions24h` | Rolling 24h | In-memory connect buffer (distinct sessionIDs) |
| `traffic.uniqueVisitors24h` | Rolling 24h | In-memory distinct salted IP hashes |
| `traffic.countrySeries7d` | 7 UTC days | `traffic_daily.jsonl` on disk |

Legacy field `challengeRunsToday` was removed (it was lifetime, not today).
