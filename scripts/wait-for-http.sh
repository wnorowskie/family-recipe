#!/usr/bin/env bash
#
# wait-for-http.sh — bounded wait for an HTTP endpoint to start answering.
#
# Replaces the unbounded `until curl -sf URL; do sleep 0.5; done` idiom that
# used to appear in every verification playbook. That form hangs forever when
# the URL is wrong — which is exactly how the `/health` vs `/v1/health` bug in
# #300 presented: the loop spun silently instead of reporting a bad path (#301).
#
# Portable by design: no `timeout`/`gtimeout` (neither ships with stock macOS,
# the primary dev platform), no GNU-only flags, Bash 3.2 compatible.
#
# Usage:
#   scripts/wait-for-http.sh <url> [timeout-seconds] [label]
#
# Examples:
#   scripts/wait-for-http.sh http://localhost:3000                # Next
#   scripts/wait-for-http.sh http://localhost:8000/v1/health      # FastAPI
#   scripts/wait-for-http.sh http://localhost:8001/health 60 importer
#
# Exit codes: 0 once the endpoint answers; 1 if it never does within the bound.

set -uo pipefail

URL="${1:-}"
TIMEOUT_SECONDS="${2:-60}"
LABEL="${3:-$URL}"

usage() {
  echo "usage: scripts/wait-for-http.sh <url> [timeout-seconds] [label]" >&2
  exit 1
}

[[ -n "$URL" ]] || usage

# Guard before the arithmetic below: under `set -u` a non-numeric value here
# dies with "FastAPI: unbound variable" instead of anything actionable — an
# easy mistake, since the docs render the label as a trailing `# FastAPI`.
[[ "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || usage

# Poll twice a second. Bash 3.2 has no float arithmetic, so bound the loop by
# attempt count rather than by comparing elapsed time.
attempts=$(( TIMEOUT_SECONDS * 2 ))

for _ in $(seq 1 "$attempts"); do
  if curl -sf -o /dev/null "$URL"; then
    echo "ready: $LABEL"
    exit 0
  fi
  sleep 0.5
done

echo "TIMED OUT after ${TIMEOUT_SECONDS}s waiting for ${LABEL} (${URL})" >&2
echo "  - Is the service actually running? Check the backgrounded job's output." >&2
echo "  - Is the path right? FastAPI health is /v1/health since #233;" >&2
echo "    the recipe-url-importer's is /health. They are different services." >&2
exit 1
