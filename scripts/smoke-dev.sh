#!/usr/bin/env bash
#
# smoke-dev.sh — end-to-end smoke check against the dev Cloud Run deployment.
#
# Post-cutover (Phase 4) the data plane is FastAPI-only: the Next `/api/*` data
# routes were deleted, and the browser reaches FastAPI through the same-origin
# `/v1/*` forwarder (src/app/v1/[...path]). This script exercises that real
# path — Next `/v1` proxy → FastAPI — plus a direct probe of the FastAPI
# service so a forwarder failure is distinguishable from a FastAPI failure.
#
# What it does:
#   1. mints two Cloud Run ID tokens (one per IAM-private service audience)
#   2. probes FastAPI directly (GET $DEV_API_URL/health) to prove the service
#      itself is up, independent of the Next forwarder
#   3. logs in as the `claude-test` seed user via the Next auth proxy, then
#      bootstraps a FastAPI access token (the in-memory token the SPA uses)
#   4. exercises the write path against same-origin `/v1/*`: create a post,
#      comment on it, react, re-read
#   5. cleans up the test post (cascade deletes comment + reaction)
#   6. confirms the post is gone (404)
#
# Two-token auth model (see scripts/dev-auth-proxy.ts and src/app/v1/[...path]):
#   * Cloud Run IAM rides on `X-Serverless-Authorization: Bearer <ID token>` —
#     Cloud Run consumes and strips it before the container sees it.
#   * The app's `Authorization: Bearer <FastAPI access token>` is left untouched
#     so the Next `/v1` forwarder can pass it through to FastAPI.
#   The two never collide because they travel in different header slots.
#
# Usage:
#   scripts/smoke-dev.sh                 # uses .env.dev.local if present
#   scripts/smoke-dev.sh --host <url>    # override Next.js base URL
#
# Required env (from .env.dev.local or shell):
#   DEV_NEXT_URL                         Cloud Run URL for family-recipe-dev
#   DEV_API_URL                          Cloud Run URL for family-recipe-api-dev
#   DEV_DEPLOYER_SA                      Service account to impersonate for ID token
#   CLAUDE_TEST_USER                     Seeded claude-test username
#   CLAUDE_TEST_PASSWORD                 Fetched from family-recipe-dev-claude-test-password
#
# Exit codes:
#   0 — all steps green
#   1 — any step failed (test post, if created, is always cleaned up)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.dev.local"

HOST_OVERRIDE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST_OVERRIDE="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Load .env.dev.local without clobbering already-set vars.
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    case "$key" in
      DEV_NEXT_URL|DEV_API_URL|DEV_DEPLOYER_SA|CLAUDE_TEST_USER|CLAUDE_TEST_PASSWORD)
        # Indirect expansion + printf -v avoids eval — a value containing
        # $(…) or backticks won't execute during load.
        if [[ -z "${!key:-}" ]]; then
          printf -v "$key" '%s' "$value"
          export "$key"
        fi
        ;;
    esac
  done < "$ENV_FILE"
fi

HOST="${HOST_OVERRIDE:-${DEV_NEXT_URL:-}}"
API_HOST="${DEV_API_URL:-}"
DEPLOYER_SA="${DEV_DEPLOYER_SA:-}"
USER="${CLAUDE_TEST_USER:-claude-test}"
PASSWORD="${CLAUDE_TEST_PASSWORD:-}"

for var in HOST API_HOST DEPLOYER_SA PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required env: $var (set in .env.dev.local or shell)" >&2
    exit 1
  fi
done

COOKIES="${COOKIES:-/tmp/fr-dev-cookies.txt}"
BODY_FILE="${BODY_FILE:-/tmp/fr-dev-body.json}"
rm -f "$COOKIES" "$BODY_FILE"

# Colored output when attached to a TTY.
if [[ -t 1 ]]; then
  GREEN=$'\e[32m' RED=$'\e[31m' YELLOW=$'\e[33m' RESET=$'\e[0m'
else
  GREEN='' RED='' YELLOW='' RESET=''
fi

pass() { echo "${GREEN}PASS${RESET}  $1"; }
fail() { echo "${RED}FAIL${RESET}  $1" >&2; }
note() { echo "${YELLOW}INFO${RESET}  $1"; }

# Cleanup runs on any exit path so a mid-flight failure doesn't leave a
# test post behind in dev. Both tokens are guaranteed set by the time a post
# can exist (create happens after minting + bootstrap), so the trap can rely
# on NEXT_TOKEN and ACCESS_TOKEN.
CREATED_POST_ID=""
cleanup() {
  local rc=$?
  if [[ -n "$CREATED_POST_ID" ]]; then
    note "cleaning up test post $CREATED_POST_ID"
    local del_status
    del_status=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
      -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -b "$COOKIES" \
      "$HOST/v1/posts/$CREATED_POST_ID" || echo "000")
    if [[ "$del_status" == "200" ]]; then
      pass "cleanup: post $CREATED_POST_ID deleted"
    else
      fail "cleanup: post $CREATED_POST_ID delete returned HTTP $del_status"
      rc=1
    fi
  fi
  rm -f "$BODY_FILE"
  exit "$rc"
}
trap cleanup EXIT

note "dev host: $HOST"
note "fastapi host: $API_HOST"
note "impersonating: $DEPLOYER_SA"

# --- Step 1: mint ID tokens -------------------------------------------------
# One token per IAM-validated audience: the Next service (every step below
# rides through it) and the FastAPI service (the direct health probe).
NEXT_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEPLOYER_SA" \
  --audiences="$HOST" 2>/tmp/fr-dev-mint.err) || {
    fail "mint Next ID token (check roles/iam.serviceAccountTokenCreator on $DEPLOYER_SA)"
    cat /tmp/fr-dev-mint.err >&2
    exit 1
  }
API_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEPLOYER_SA" \
  --audiences="$API_HOST" 2>/tmp/fr-dev-mint.err) || {
    fail "mint FastAPI ID token (check roles/iam.serviceAccountTokenCreator on $DEPLOYER_SA)"
    cat /tmp/fr-dev-mint.err >&2
    exit 1
  }
pass "mint Bearer ID tokens (next len=${#NEXT_TOKEN}, api len=${#API_TOKEN})"

# --- Step 2: FastAPI direct health ------------------------------------------
# Hit the FastAPI service directly (bypassing the Next forwarder) so an
# outage here points at FastAPI itself, not the proxy. /health needs no app
# auth, so the IAM token can ride on Authorization with nothing to collide.
FASTAPI_HEALTH_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $API_TOKEN" \
  "$API_HOST/health")
if [[ "$FASTAPI_HEALTH_STATUS" != "200" ]]; then
  fail "GET \$DEV_API_URL/health → HTTP $FASTAPI_HEALTH_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
if [[ "$(jq -r '.status' < "$BODY_FILE")" != "ok" ]]; then
  fail "FastAPI /health returned 200 but body.status != ok"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "GET \$DEV_API_URL/health → 200 (FastAPI up)"

# --- Step 3: Next health ----------------------------------------------------
HEALTH_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  "$HOST/api/health")
if [[ "$HEALTH_STATUS" != "200" ]]; then
  fail "GET /api/health → HTTP $HEALTH_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "GET /api/health → 200"

# --- Step 4: login ----------------------------------------------------------
# The Next `/api/auth/login` proxy forwards to FastAPI /v1/auth/login and
# relays its Set-Cookie headers (refresh_token + csrf_token) back onto the
# Next origin. No app Bearer yet — login is the credential exchange.
LOGIN_BODY=$(jq -n --arg u "$USER" --arg p "$PASSWORD" \
  '{emailOrUsername: $u, password: $p}')
LOGIN_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -c "$COOKIES" \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY" \
  "$HOST/api/auth/login")
if [[ "$LOGIN_STATUS" != "200" ]]; then
  fail "POST /api/auth/login → HTTP $LOGIN_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
# Post-cutover FastAPI sets refresh_token + csrf_token (no Next `session` JWT).
if ! grep -q $'\trefresh_token\t' "$COOKIES"; then
  fail "login returned 200 but no refresh_token cookie was set"
  exit 1
fi
pass "POST /api/auth/login → 200 (refresh_token cookie set)"

# --- Step 5: bootstrap FastAPI access token ---------------------------------
# The SPA mints an in-memory access token on each page load via this route,
# which refreshes against FastAPI (echoing X-CSRF-Token from the csrf_token
# cookie on our behalf) and rotates the refresh cookie. We capture the token
# for the Bearer-authenticated data plane below and re-save rotated cookies.
BOOTSTRAP_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -X POST \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -b "$COOKIES" -c "$COOKIES" \
  "$HOST/api/auth/bootstrap")
if [[ "$BOOTSTRAP_STATUS" != "200" ]]; then
  fail "POST /api/auth/bootstrap → HTTP $BOOTSTRAP_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
ACCESS_TOKEN=$(jq -r '.accessToken // empty' < "$BODY_FILE")
if [[ -z "$ACCESS_TOKEN" ]]; then
  fail "bootstrap returned 200 but no accessToken in body"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "POST /api/auth/bootstrap → 200 (access token len=${#ACCESS_TOKEN})"

# --- Step 6: create test post (multipart; title + caption, no photo) --------
# Timestamp+PID tag so concurrent runs (or leftover rows from a crash prior
# to this version) are trivially distinguishable.
POST_TAG="smoke-dev-$(date -u +%Y%m%dT%H%M%SZ)-$$"
POST_PAYLOAD=$(jq -cn --arg title "claude smoke-dev test ($POST_TAG)" \
  --arg caption "automated — auto-deleted by scripts/smoke-dev.sh" \
  '{title: $title, caption: $caption}')
# --form-string (not -F) — otherwise curl treats `;` in the value as a
# Content-Type delimiter and truncates the payload.
CREATE_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b "$COOKIES" \
  --form-string "payload=$POST_PAYLOAD" \
  "$HOST/v1/posts")
if [[ "$CREATE_STATUS" != "201" ]]; then
  fail "POST /v1/posts → HTTP $CREATE_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
CREATED_POST_ID=$(jq -r '.post.id' < "$BODY_FILE")
if [[ -z "$CREATED_POST_ID" || "$CREATED_POST_ID" == "null" ]]; then
  fail "create returned 201 but no post.id in body"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "POST /v1/posts → 201 (id=$CREATED_POST_ID)"

# --- Step 7: create comment -------------------------------------------------
COMMENT_PAYLOAD=$(jq -cn '{text: "smoke-dev comment — safe to ignore"}')
COMMENT_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b "$COOKIES" \
  --form-string "payload=$COMMENT_PAYLOAD" \
  "$HOST/v1/posts/$CREATED_POST_ID/comments")
if [[ "$COMMENT_STATUS" != "201" ]]; then
  fail "POST /v1/posts/:id/comments → HTTP $COMMENT_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
COMMENT_ID=$(jq -r '.comment.id' < "$BODY_FILE")
pass "POST /v1/posts/:id/comments → 201 (id=$COMMENT_ID)"

# --- Step 8: add reaction ---------------------------------------------------
# /v1/reactions is a toggle and returns 200 (not 201) with the refreshed
# summary array.
REACT_PAYLOAD=$(jq -n --arg id "$CREATED_POST_ID" \
  '{targetType: "post", targetId: $id, emoji: "👍"}')
REACT_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" \
  -d "$REACT_PAYLOAD" \
  "$HOST/v1/reactions")
if [[ "$REACT_STATUS" != "200" ]]; then
  fail "POST /v1/reactions → HTTP $REACT_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
REACT_COUNT=$(jq -r '.reactions | length' < "$BODY_FILE")
if [[ "$REACT_COUNT" -lt 1 ]]; then
  fail "reactions response empty after POST"
  exit 1
fi
pass "POST /v1/reactions → 200 (summary size=$REACT_COUNT)"

# --- Step 9: re-read post; confirm comment + reaction present --------------
READ_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b "$COOKIES" \
  "$HOST/v1/posts/$CREATED_POST_ID")
if [[ "$READ_STATUS" != "200" ]]; then
  fail "GET /v1/posts/:id → HTTP $READ_STATUS"
  exit 1
fi
COMMENT_COUNT=$(jq -r '.post.comments | length' < "$BODY_FILE")
REACTION_TOTAL=$(jq -r '[.post.reactionSummary[].count] | add // 0' < "$BODY_FILE")
if [[ "$COMMENT_COUNT" -lt 1 || "$REACTION_TOTAL" -lt 1 ]]; then
  fail "post re-read: expected ≥1 comment and ≥1 reaction, got comments=$COMMENT_COUNT reactions=$REACTION_TOTAL"
  exit 1
fi
pass "GET /v1/posts/:id → 200 (comments=$COMMENT_COUNT, reactions=$REACTION_TOTAL)"

# --- Step 10: delete + confirm 404 ------------------------------------------
# Run delete inline so we can then probe for the 404. Clear CREATED_POST_ID
# so the trap doesn't try to delete a second time.
DEL_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b "$COOKIES" \
  "$HOST/v1/posts/$CREATED_POST_ID")
if [[ "$DEL_STATUS" != "200" ]]; then
  fail "DELETE /v1/posts/:id → HTTP $DEL_STATUS"
  exit 1
fi
pass "DELETE /v1/posts/:id → 200"

RE_READ=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "X-Serverless-Authorization: Bearer $NEXT_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b "$COOKIES" \
  "$HOST/v1/posts/$CREATED_POST_ID")
if [[ "$RE_READ" != "404" ]]; then
  fail "GET /v1/posts/:id after delete → HTTP $RE_READ (expected 404)"
  exit 1
fi
pass "GET /v1/posts/:id after delete → 404 (cleanup confirmed)"

CREATED_POST_ID=""
echo
echo "${GREEN}all checks passed${RESET}"
