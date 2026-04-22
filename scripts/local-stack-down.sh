#!/usr/bin/env bash
#
# local-stack-down.sh — tear down the sandbox Postgres stack created by
# local-stack-up.sh. Stops and removes the container, optionally drops the
# data volume, and deletes the .env.sandbox file.
#
# Usage:
#   scripts/local-stack-down.sh             # keep the data volume
#   scripts/local-stack-down.sh --purge     # also remove the data volume
#
# Safe to run when nothing is up (idempotent).

set -euo pipefail

CONTAINER_NAME="family-recipe-pg-sandbox"
VOLUME_NAME="family-recipe-pg-sandbox-data"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.sandbox"

PURGE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge)
      PURGE=true
      shift
      ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

step() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH — nothing to tear down" >&2
  exit 0
fi

step "Stop + remove container ${CONTAINER_NAME}"
if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
else
  echo "    container not present"
fi

if $PURGE; then
  step "Remove data volume ${VOLUME_NAME}"
  if docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
    docker volume rm "$VOLUME_NAME" >/dev/null
  else
    echo "    volume not present"
  fi
fi

step "Remove ${ENV_FILE}"
if [[ -f "$ENV_FILE" ]]; then
  rm -f "$ENV_FILE"
else
  echo "    already absent"
fi

echo ""
echo "✓ local stack torn down"
