#!/usr/bin/env bash
#
# claude-login.sh — log in as the dev `claude-test` user and save a session cookie jar.
#
# Usage:
#   scripts/claude-login.sh                        # Next dev server on :3000
#   scripts/claude-login.sh --host http://localhost:8000   # FastAPI
#   scripts/claude-login.sh --host https://dev.example.com # remote preview
#
# Reads CLAUDE_TEST_USER and CLAUDE_TEST_PASSWORD from env or .env.local
# (same values the `db:seed` script uses). Writes cookies to
# COOKIES=${COOKIES:-/tmp/fr-cookies.txt} and prints that path on success.
#
# Exit codes: 0 on 200, 1 on non-200 or env/parse errors.

set -euo pipefail

HOST="http://localhost:3000"
COOKIES="${COOKIES:-/tmp/fr-cookies.txt}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Load .env.local if present (without clobbering already-set env vars).
ENV_FILE="$(dirname "$0")/../.env.local"
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    if [[ "$key" == "CLAUDE_TEST_USER" && -z "${CLAUDE_TEST_USER:-}" ]]; then
      export CLAUDE_TEST_USER="$value"
    elif [[ "$key" == "CLAUDE_TEST_PASSWORD" && -z "${CLAUDE_TEST_PASSWORD:-}" ]]; then
      export CLAUDE_TEST_PASSWORD="$value"
    fi
  done < "$ENV_FILE"
fi

USER="${CLAUDE_TEST_USER:-claude-test}"
PASSWORD="${CLAUDE_TEST_PASSWORD:-claude-test-password}"

# Next mounts auth under /api/auth/login; FastAPI uses /auth/login.
if [[ "$HOST" == *":8000"* ]]; then
  LOGIN_PATH="/auth/login"
else
  LOGIN_PATH="/api/auth/login"
fi

rm -f "$COOKIES"

HTTP_CODE=$(curl -sS -o /tmp/claude-login-body.json -w '%{http_code}' \
  -c "$COOKIES" \
  -H "Content-Type: application/json" \
  -d "{\"emailOrUsername\":\"${USER}\",\"password\":\"${PASSWORD}\"}" \
  "${HOST}${LOGIN_PATH}")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Login failed: HTTP ${HTTP_CODE}" >&2
  cat /tmp/claude-login-body.json >&2 || true
  echo >&2
  exit 1
fi

if ! grep -q 'session' "$COOKIES"; then
  echo "Login returned 200 but no session cookie was set" >&2
  exit 1
fi

echo "$COOKIES"
