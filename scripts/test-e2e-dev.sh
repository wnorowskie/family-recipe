#!/usr/bin/env bash
#
# test-e2e-dev.sh — run Playwright against the live dev Cloud Run deployment
# via the auth-injecting proxy (scripts/dev-auth-proxy.ts).
#
# Pipeline: start proxy in background → wait for /api/health → export
# PLAYWRIGHT_BASE_URL → run `playwright test` → tear down the proxy.
#
# Pass Playwright flags after `--`:
#   scripts/test-e2e-dev.sh                  # full e2e suite
#   scripts/test-e2e-dev.sh -- --ui          # headed
#   scripts/test-e2e-dev.sh -- e2e/auth.spec.ts

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${REPO_ROOT}/.env.dev.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PORT="${PROXY_PORT:-3100}"
export PROXY_PORT="$PORT"
PROXY_URL="http://localhost:${PORT}"

LOG_DIR="${TMPDIR:-/tmp}"
PROXY_LOG="${LOG_DIR}/dev-auth-proxy.log"

# Pipe Playwright's default E2E creds through to the test run. The defaults
# match prisma/seed.ts; only the password comes from .env.dev.local in dev.
export E2E_USER="${E2E_USER:-${CLAUDE_TEST_USER:-claude-test}}"
if [[ -z "${E2E_PASSWORD:-}" && -n "${CLAUDE_TEST_PASSWORD:-}" ]]; then
  export E2E_PASSWORD="$CLAUDE_TEST_PASSWORD"
fi

PROXY_PID=""
cleanup() {
  local rc=$?
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  exit "$rc"
}
trap cleanup EXIT

npx tsx scripts/dev-auth-proxy.ts >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!

echo "[test-e2e-dev] proxy PID=$PROXY_PID, logs → $PROXY_LOG"

# Poll until the proxy's health probe succeeds; bail if the proxy crashed.
for _ in $(seq 1 30); do
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "[test-e2e-dev] proxy exited before becoming ready:" >&2
    cat "$PROXY_LOG" >&2
    exit 1
  fi
  if curl -sf -o /dev/null "${PROXY_URL}/api/health"; then
    break
  fi
  sleep 1
done

if ! curl -sf -o /dev/null "${PROXY_URL}/api/health"; then
  echo "[test-e2e-dev] proxy never reached ${PROXY_URL}/api/health" >&2
  cat "$PROXY_LOG" >&2
  exit 1
fi

echo "[test-e2e-dev] proxy ready at ${PROXY_URL}; running Playwright…"

export PLAYWRIGHT_BASE_URL="$PROXY_URL"

# Everything after `--` forwards to playwright; nothing after `--` runs the
# default suite.
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ARGS=("$@")
      break
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

npx playwright test ${ARGS[@]+"${ARGS[@]}"}
