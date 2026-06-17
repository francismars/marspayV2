# Challenge bounty protocol (marspay + chain-duel-react)

Practice challenge bounties: server-enforced Nostr eligibility, seeded game replay validation, signed victory kind-1 publish, NIP-57 zap payout.

## Environment

| Variable | Purpose |
|----------|---------|
| `CHAINDUEL_NOSTR_PUBKEY` | Hex pubkey users must follow (kind-3 `#p`) |
| `CHALLENGE_BOUNTY_DAILY_CAP_SATS` | Daily global zap budget (default `100000`) |
| `NOSTR_PK` | Server key for NDK publish + zap 9734 |
| `LNBITS_URL`, `LNBITS_KEY` | Pay bounty zaps |

## Eligibility (`getChallengeEligibility`)

Server checks (24h cache):

- Verified NIP-05
- Kind-3 following count ≥ 100
- Follows `CHAINDUEL_NOSTR_PUBKEY` (skipped if unset)
- Account age ≥ 30 days (earliest relay event)
- Valid `lud16` with NIP-57 zap support (`allowsNostr` on LNURL-pay metadata)
- App Nostr session at claim time

## Run flow

1. `requestChallengeRun` `{ challengeId }` → `{ runId, seed, bountySats, expiresAt }` — **no Nostr sign-in required** (anonymous runs keyed by socket session)
2. Client plays with `initRunRng(seed)` — no mempool spawns during challenge runs
3. Client logs P1 inputs `{ tick, dir }` where `tick` = sim step index (one per `stepGame`)
4. `submitChallengeWin` `{ runId, inputLog }` → server replays → `{ claimToken, noteContent, noteTags }` — **no sign-in required** (claim token bound to socket session)
5. Client signs in with Nostr (if not already), then signs exact note → `claimChallengeBounty` `{ claimToken, event }`
6. Server publishes kind-1, zaps note via LNURL-pay, records claim (one per pubkey + challengeId)

## Persistence

Paid claims and daily zap spend survive server restarts:

- `data/challenge_claims/claims.jsonl` — append-only log; one line per successful zap (`pubkey` + `challengeId` unique)
- `data/challenge_claims/daily_spend.json` — UTC day key → total sats zapped that day (for `CHALLENGE_BOUNTY_DAILY_CAP_SATS`)

Runs and claim tokens remain in-memory only (short TTL). Pending claims (note published, zap failed) are RAM-only until `retryChallengeZap` succeeds.

## Retry

`retryChallengeZap` `{ challengeId }` — if note published but zap failed.

## Socket events

| Client → server | Server → client |
|-----------------|-----------------|
| `getChallengeEligibility` | `resChallengeEligibility` |
| `getChallengeCatalog` | `resChallengeCatalog` |
| `requestChallengeRun` | `resChallengeRun` |
| `submitChallengeWin` | `resSubmitChallengeWin` |
| `claimChallengeBounty` | `resChallengeClaim` |
| `retryChallengeZap` | `resRetryChallengeZap` |

## Implementation files

- `marspay/src/socket/challengeBounty.ts`
- `marspay/src/state/challengeState.ts`
- `marspay/src/state/challengeClaimStore.ts`
- `marspay/src/game/challengeEngine/` (copy of practice engine + `replayRunner.ts`)
- `marspay/src/calls/nostr/challengeEligibility.ts`
- `chain-duel-react/src/lib/challengeBounty.ts`
- `chain-duel-react/src/lib/nostr/signChallengeBountyNote.ts`
