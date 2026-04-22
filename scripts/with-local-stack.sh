#!/usr/bin/env bash
#
# with-local-stack.sh — run a command against the sandbox Postgres stack.
#
# Exports every key from .env.sandbox into the environment and then execs the
# supplied command. Use this instead of sourcing .env.sandbox by hand so
# one-liners like `npm run dev` and `uvicorn ...` pick up the sandbox
# DATABASE_URL without mutating the user's .env or shell profile.
#
# Usage:
#   scripts/with-local-stack.sh npm run dev
#   scripts/with-local-stack.sh uvicorn apps.api.src.main:app --port 8000
#   scripts/with-local-stack.sh npx prisma studio --schema prisma/schema.postgres.node.prisma
#
# Exits 2 if .env.sandbox does not exist (run scripts/local-stack-up.sh first).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.sandbox"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Sandbox env not found at ${ENV_FILE}" >&2
  echo "Run scripts/local-stack-up.sh first." >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec "$@"
