#!/usr/bin/env bash
#
# smoke-dev.sh — end-to-end smoke check against the dev Cloud Run deployment.
#
# What it does:
#   1. mints a Bearer ID token by impersonating the deployer SA
#   2. logs in as the `claude-test` seed user (ID-token Bearer + JSON body)
#   3. exercises a write path: create a post, comment on it, react, re-read
#   4. cleans up the test post (cascade deletes comment + reaction)
#   5. confirms the post is gone
#
# Usage:
#   scripts/smoke-dev.sh                 # uses .env.dev.local if present
#   scripts/smoke-dev.sh --host <url>    # override Next.js base URL
#
# Required env (from .env.dev.local or shell):
#   DEV_NEXT_URL                         Cloud Run URL for family-recipe-dev
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
      sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
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
      DEV_NEXT_URL|DEV_DEPLOYER_SA|CLAUDE_TEST_USER|CLAUDE_TEST_PASSWORD)
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
DEPLOYER_SA="${DEV_DEPLOYER_SA:-}"
USER="${CLAUDE_TEST_USER:-claude-test}"
PASSWORD="${CLAUDE_TEST_PASSWORD:-}"

for var in HOST DEPLOYER_SA PASSWORD; do
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
# test post behind in dev.
CREATED_POST_ID=""
cleanup() {
  local rc=$?
  if [[ -n "$CREATED_POST_ID" ]]; then
    note "cleaning up test post $CREATED_POST_ID"
    local del_status
    del_status=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" \
      -b "$COOKIES" \
      "$HOST/api/posts/$CREATED_POST_ID" || echo "000")
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
note "impersonating: $DEPLOYER_SA"

# --- Step 1: mint ID token --------------------------------------------------
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEPLOYER_SA" \
  --audiences="$HOST" 2>/tmp/fr-dev-mint.err) || {
    fail "mint ID token (check roles/iam.serviceAccountTokenCreator on $DEPLOYER_SA)"
    cat /tmp/fr-dev-mint.err >&2
    exit 1
  }
pass "mint Bearer ID token (len=${#TOKEN})"

# --- Step 2: health probe ---------------------------------------------------
HEALTH_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  "$HOST/api/health")
if [[ "$HEALTH_STATUS" != "200" ]]; then
  fail "GET /api/health → HTTP $HEALTH_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "GET /api/health → 200"

# --- Step 3: login ----------------------------------------------------------
LOGIN_BODY=$(jq -n --arg u "$USER" --arg p "$PASSWORD" \
  '{emailOrUsername: $u, password: $p}')
LOGIN_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -c "$COOKIES" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_BODY" \
  "$HOST/api/auth/login")
if [[ "$LOGIN_STATUS" != "200" ]]; then
  fail "POST /api/auth/login → HTTP $LOGIN_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
if ! grep -q $'\tsession\t' "$COOKIES"; then
  fail "login returned 200 but no session cookie was set"
  exit 1
fi
pass "POST /api/auth/login → 200 (session cookie set)"

# --- Step 4: create test post (multipart; title + caption, no photo) --------
# Timestamp+PID tag so concurrent runs (or leftover rows from a crash prior
# to this version) are trivially distinguishable.
POST_TAG="smoke-dev-$(date -u +%Y%m%dT%H%M%SZ)-$$"
POST_PAYLOAD=$(jq -cn --arg title "claude smoke-dev test ($POST_TAG)" \
  --arg caption "automated — auto-deleted by scripts/smoke-dev.sh" \
  '{title: $title, caption: $caption}')
# --form-string (not -F) — otherwise curl treats `;` in the value as a
# Content-Type delimiter and truncates the payload.
CREATE_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIES" \
  --form-string "payload=$POST_PAYLOAD" \
  "$HOST/api/posts")
if [[ "$CREATE_STATUS" != "201" ]]; then
  fail "POST /api/posts → HTTP $CREATE_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
CREATED_POST_ID=$(jq -r '.post.id' < "$BODY_FILE")
if [[ -z "$CREATED_POST_ID" || "$CREATED_POST_ID" == "null" ]]; then
  fail "create returned 201 but no post.id in body"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
pass "POST /api/posts → 201 (id=$CREATED_POST_ID)"

# --- Step 5: create comment -------------------------------------------------
COMMENT_PAYLOAD=$(jq -cn '{text: "smoke-dev comment — safe to ignore"}')
COMMENT_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIES" \
  --form-string "payload=$COMMENT_PAYLOAD" \
  "$HOST/api/posts/$CREATED_POST_ID/comments")
if [[ "$COMMENT_STATUS" != "201" ]]; then
  fail "POST /api/posts/:id/comments → HTTP $COMMENT_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
COMMENT_ID=$(jq -r '.comment.id' < "$BODY_FILE")
pass "POST /api/posts/:id/comments → 201 (id=$COMMENT_ID)"

# --- Step 6: add reaction ---------------------------------------------------
REACT_PAYLOAD=$(jq -n --arg id "$CREATED_POST_ID" \
  '{targetType: "post", targetId: $id, emoji: "👍"}')
REACT_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -b "$COOKIES" \
  -d "$REACT_PAYLOAD" \
  "$HOST/api/reactions")
if [[ "$REACT_STATUS" != "200" ]]; then
  fail "POST /api/reactions → HTTP $REACT_STATUS"
  head -c 400 "$BODY_FILE" >&2; echo >&2
  exit 1
fi
REACT_COUNT=$(jq -r '.reactions | length' < "$BODY_FILE")
if [[ "$REACT_COUNT" -lt 1 ]]; then
  fail "reactions response empty after POST"
  exit 1
fi
pass "POST /api/reactions → 200 (summary size=$REACT_COUNT)"

# --- Step 7: re-read post; confirm comment + reaction present --------------
READ_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIES" \
  "$HOST/api/posts/$CREATED_POST_ID")
if [[ "$READ_STATUS" != "200" ]]; then
  fail "GET /api/posts/:id → HTTP $READ_STATUS"
  exit 1
fi
COMMENT_COUNT=$(jq -r '.post.comments | length' < "$BODY_FILE")
REACTION_TOTAL=$(jq -r '[.post.reactionSummary[].count] | add // 0' < "$BODY_FILE")
if [[ "$COMMENT_COUNT" -lt 1 || "$REACTION_TOTAL" -lt 1 ]]; then
  fail "post re-read: expected ≥1 comment and ≥1 reaction, got comments=$COMMENT_COUNT reactions=$REACTION_TOTAL"
  exit 1
fi
pass "GET /api/posts/:id → 200 (comments=$COMMENT_COUNT, reactions=$REACTION_TOTAL)"

# --- Step 8: delete (via trap) + confirm 404 --------------------------------
# Run delete inline so we can then probe for the 404. Clear CREATED_POST_ID
# so the trap doesn't try to delete a second time.
DEL_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIES" \
  "$HOST/api/posts/$CREATED_POST_ID")
if [[ "$DEL_STATUS" != "200" ]]; then
  fail "DELETE /api/posts/:id → HTTP $DEL_STATUS"
  exit 1
fi
pass "DELETE /api/posts/:id → 200"

RE_READ=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIES" \
  "$HOST/api/posts/$CREATED_POST_ID")
if [[ "$RE_READ" != "404" ]]; then
  fail "GET /api/posts/:id after delete → HTTP $RE_READ (expected 404)"
  exit 1
fi
pass "GET /api/posts/:id after delete → 404 (cleanup confirmed)"

CREATED_POST_ID=""
echo
echo "${GREEN}all checks passed${RESET}"
