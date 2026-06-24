#!/usr/bin/env bash
# Quick post-deploy check for marspay admin dashboard.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

PORT="${PORT:-3001}"
PASSWORD="${ADMIN_PASSWORD:-}"
BASE="http://127.0.0.1:${PORT}"
COOKIE="/tmp/marspay-dash-verify.cookie"

if [[ -z "$PASSWORD" ]]; then
  echo "ADMIN_PASSWORD not set in .env"
  exit 1
fi

echo "== Login =="
curl -sf -c "$COOKIE" -X POST "${BASE}/dashboard/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"${PASSWORD}\"}" | jq .

echo ""
echo "== Overview =="
curl -sf -b "$COOKIE" "${BASE}/dashboard/api/overview" | jq .

echo ""
echo "== Funnels (challenge steps) =="
curl -sf -b "$COOKIE" "${BASE}/dashboard/api/funnels" | jq '.challenge.steps | keys'

echo ""
echo "== Recent activity =="
curl -sf -b "$COOKIE" "${BASE}/dashboard/api/activity?limit=5" | jq '.events | length'

if [[ -f data/telemetry/events.jsonl ]]; then
  echo ""
  echo "== events.jsonl tail =="
  tail -1 data/telemetry/events.jsonl | jq -r '.event' 2>/dev/null || echo "(empty or invalid)"
else
  echo ""
  echo "events.jsonl not created yet (no track events since deploy)"
fi

echo ""
echo "Dashboard UI: ${BASE}/dashboard"
echo "OK"
