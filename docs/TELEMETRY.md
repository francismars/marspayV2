# Telemetry

Structured funnel and ops tracking for marspay. Events emit as JSON lines to stdout (`"type":"track"`) and roll up into `data/telemetry/`.

## Local dev

```bash
npm run dev
# Play a challenge or online match, then:
grep '"type":"track"' logs/marspay-out.log | jq .
grep '\[CHALLENGE_START\]' logs/marspay-out.log
curl 'http://localhost:3001/dashboard?password=YOUR_ADMIN_PASSWORD' | jq .telemetry
```

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
| `data/telemetry/challenge_stats.json` | Win/replay counters |
| `data/telemetry/counters.json` | Funnel counter rollup |
| `data/challenge_claims/claims.jsonl` | Paid bounty audit |
| `data/online_archive/index.jsonl` | ONLINE match index |

All under `data/` are gitignored.

## Privacy

Track events use `pubkeyPrefix` (12 hex chars) only. No nsec, NWC URIs, lud16, or replay payloads.
