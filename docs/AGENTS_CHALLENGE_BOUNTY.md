# Challenge bounty protocol (marspay + chain-duel-react)

Practice challenge bounties: server-enforced Nostr eligibility, seeded game replay validation, signed victory kind-1 publish, NIP-57 zap payout.

## Environment

| Variable | Purpose |
|----------|---------|
| `CHAINDUEL_NOSTR_PUBKEY` | Hex pubkey users must follow (kind-3 `#p`) |
| `CHALLENGE_BOUNTY_DAILY_CAP_SATS` | Daily global zap budget (default `100000`) |
| `CHALLENGE_RUN_RATE_LIMIT_PER_MIN` | Max `requestChallengeRun` per socket session per minute (default `12`) |
| `CHALLENGE_SUBMIT_RATE_LIMIT_PER_MIN` | Max `submitChallengeWin` per socket session per minute (default `30`) |
| `NOSTR_PK` | Server key for NDK publish + zap 9734 |
| `LNBITS_URL`, `LNBITS_KEY` | Pay bounty zaps |

## Eligibility (`getChallengeEligibility`)

Server checks (cached up to 24h when eligible, 5 min when not; pass `{ refresh: true }` to bypass):

- Verified NIP-05
- Kind-3 following count ≥ 100
- Follows `CHAINDUEL_NOSTR_PUBKEY` (skipped if unset)
- Account age ≥ 30 days (earliest relay event)
- Valid `lud16` with NIP-57 zap support (`allowsNostr` on LNURL-pay metadata)
- App Nostr session at claim time

## Run flow

1. **Nostr sign-in required** — sign in before selecting a challenge; all eligibility checks must pass before `requestChallengeRun`
2. `requestChallengeRun` `{ challengeId }` → `{ runId, seed, bountySats, expiresAt }` (requires full eligibility; run bound to app session pubkey)
3. Client plays with `initRunRng(seed)` — standard arena (no convergence shrink); no mempool spawns during challenge runs
4. Client logs P1 inputs `{ tick, dir }` where `tick` = sim step index (one per `stepGame`)
5. `submitChallengeWin` `{ runId, inputLog }` → server replays active run only → `{ claimToken, noteContent, noteTags }` (one win per `runId`)
6. Client signs exact note → `claimChallengeBounty` `{ claimToken, event }`
7. Server publishes kind-1, zaps note via LNURL-pay, records claim (one per `pubkey + challengeId` and one per `runId`)

Rate limits (per socket `sessionID`, rolling 1-minute window): `requestChallengeRun`, `submitChallengeWin`.

## Persistence

Paid claims and daily zap spend survive server restarts:

- `data/challenge_claims/claims.jsonl` — append-only log; one line per successful zap (`pubkey + challengeId` and `runId` each unique)
- `data/challenge_claims/daily_spend.json` — UTC day key → total sats zapped that day (for `CHALLENGE_BOUNTY_DAILY_CAP_SATS`)

Runs and claim tokens remain in-memory only (short TTL). Pending claims (note published, zap failed) are RAM-only until `retryChallengeZap` succeeds.

## Retry

`retryChallengeZap` `{ challengeId }` — if note published but zap failed.

## Socket events

| Client → server | Server → client |
|-----------------|-----------------|
| `getChallengeEligibility` | `resChallengeEligibility` | Optional `{ refresh: true }` bypasses cache |
| `getChallengeCatalog` | `resChallengeCatalog` |
| `requestChallengeRun` | `resChallengeRun` |
| `submitChallengeWin` | `resSubmitChallengeWin` |
| `claimChallengeBounty` | `resChallengeClaim` |
| `retryChallengeZap` | `resRetryChallengeZap` |

## Implementation files

- `marspay/src/socket/challengeBounty.ts`
- `marspay/src/state/challengeState.ts`
- `marspay/src/state/challengeClaimStore.ts`
- `marspay/src/state/challengeRateLimit.ts`
- `marspay/src/game/challengeEngine/` (copy of practice engine + `replayRunner.ts`)
- `marspay/src/calls/nostr/challengeEligibility.ts`
- `chain-duel-react/src/lib/challengeBounty.ts`
- `chain-duel-react/src/lib/nostr/signChallengeBountyNote.ts`
