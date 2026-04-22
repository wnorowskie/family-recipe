#!/usr/bin/env bash
#
# check-prisma-drift.sh — replays prisma/migrations into a throwaway Postgres and
# fails if `prisma migrate diff` against either Postgres schema produces SQL.
#
# Used by the `prisma-drift-check` CI job and runnable locally:
#
#   DATABASE_URL=postgresql://user:pass@localhost:5432/drift \
#     scripts/check-prisma-drift.sh
#
# The DB pointed at by DATABASE_URL is reset to an empty `public` schema by the
# script, so point it at a throwaway DB — never the local dev DB.
#
# Migration apply order is lexicographic with a retry pass: if a migration fails
# (typically because it references a table created in a later-named migration),
# it's deferred and retried after the rest have applied. This tolerates the one
# known out-of-order dependency in this repo (20250225210000_add_feedback_submissions
# references users/family_spaces from 20251130224838_add_recipe_courses).
#
# Only Node + the Prisma CLI are required; no local `psql` dependency.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

: "${DATABASE_URL:?DATABASE_URL must point at a throwaway Postgres DB}"

SCHEMAS=(
  "prisma/schema.postgres.prisma"
  "prisma/schema.postgres.node.prisma"
)

# Reset public schema so replays start from empty state. We intentionally don't
# drop the DB itself — the caller owns that lifecycle.
printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n' \
  | npx --no-install prisma db execute --url "$DATABASE_URL" --stdin >/dev/null

# Collect migration files in lexicographic order (bash 3-safe, macOS-friendly).
PENDING=()
while IFS= read -r line; do
  PENDING+=("$line")
done < <(find prisma/migrations -mindepth 2 -name migration.sql | sort)

# Iterate retry passes until either everything is applied or no forward progress
# is made. A single stuck migration yields a non-empty PENDING and non-zero exit.
PASS=1
while [ "${#PENDING[@]}" -gt 0 ]; do
  FAILED=()
  PROGRESS=0
  for f in "${PENDING[@]}"; do
    if npx --no-install prisma db execute --url "$DATABASE_URL" --file "$f" >/dev/null 2>&1; then
      echo "pass $PASS: applied $f"
      PROGRESS=1
    else
      FAILED+=("$f")
    fi
  done
  if [ "$PROGRESS" -eq 0 ]; then
    echo ""
    echo "ERROR: Could not apply the following migrations after $((PASS - 1)) passes:" >&2
    for f in "${FAILED[@]}"; do
      echo "  - $f" >&2
    done
    echo ""
    echo "Re-running the first failing migration with output to surface the error:" >&2
    npx --no-install prisma db execute --url "$DATABASE_URL" --file "${FAILED[0]}" >&2 || true
    exit 1
  fi
  PENDING=(${FAILED[@]+"${FAILED[@]}"})
  PASS=$((PASS + 1))
done

echo ""
echo "All migrations applied. Diffing against Prisma schemas..."
echo ""

DRIFT=0
for schema in "${SCHEMAS[@]}"; do
  echo "=== prisma migrate diff vs $schema ==="
  # --exit-code: 0=no diff, 2=diff found. 1 is reserved for errors.
  set +e
  OUT=$(npx --no-install prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel "$schema" \
    --script \
    --exit-code 2>&1)
  code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    echo "OK — migrations match $schema."
  elif [ "$code" -eq 2 ]; then
    echo "DRIFT — migrations do not match $schema. Suggested fix:"
    echo ""
    echo "$OUT"
    echo ""
    DRIFT=1
  else
    echo "prisma migrate diff failed with exit code $code:" >&2
    echo "$OUT" >&2
    exit 1
  fi
  echo ""
done

if [ "$DRIFT" -ne 0 ]; then
  echo "ERROR: Prisma schema(s) are drifting from prisma/migrations/." >&2
  echo "Update the schema(s) or add a follow-up migration so the diff is empty." >&2
  exit 1
fi

echo "All Prisma schemas match the migration history."
