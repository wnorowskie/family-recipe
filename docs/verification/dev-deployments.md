# Dev Deployment Verification

Exercise the live `develop`-branch Cloud Run deployment before merging a `develop → main` release PR. Local verification covers the code under change; this playbook covers the **deployed artifact** — that nothing broke in the build, Prisma migration, or Cloud Run env-var wiring between last green local run and production.

Dev is Eric's personal sandbox. Writes are fair game; the script cleans up after itself.

## When to run this

| You are…                                                                | Use                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changing code in this branch                                            | Local playbook for the thing you touched — [ui.md](ui.md), [next-api.md](next-api.md), [prisma.md](prisma.md), [recipe-url-importer.md](recipe-url-importer.md) |
| **About to open / merge a `develop → main` PR**                         | **This playbook** plus the `/release-testing` skill                                                                                                             |
| Debugging a dev-only regression (e.g. GCS, Cloud SQL proxy, deploy env) | This playbook                                                                                                                                                   |

**Rule of thumb:** local catches "did my code work?"; dev catches "did the build+migrate+deploy pipeline work?". Run local first, then this, and don't skip either for a release.

## Dev infrastructure reference

| Thing                     | Value                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| GCP project               | `family-recipe-dev`                                                                 |
| Region                    | `us-east1`                                                                          |
| Next.js Cloud Run         | `family-recipe-dev` → `https://family-recipe-dev-894181878182.us-east1.run.app`     |
| Recipe importer Cloud Run | `recipe-importer-dev` → `https://recipe-importer-dev-894181878182.us-east1.run.app` |
| FastAPI                   | not yet deployed to dev                                                             |
| Cloud SQL instance        | `family-recipe-dev` (`family-recipe-dev:us-east1:family-recipe-dev`)                |
| Runtime SA                | `family-recipe-runner@family-recipe-dev.iam.gserviceaccount.com`                    |
| Deployer SA               | `family-recipe-deployer@family-recipe-dev.iam.gserviceaccount.com`                  |

Both Cloud Run services run with `--no-allow-unauthenticated` + `--ingress all`, so every request needs a Bearer ID token from an account with `roles/run.invoker`.

## One-time setup

### 1. Grant yourself tokenCreator on the deployer SA

The deployer SA already has `roles/run.invoker` on both dev services (it's how CI's smoke check works). We give your user identity the ability to mint ID tokens on its behalf:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  family-recipe-deployer@family-recipe-dev.iam.gserviceaccount.com \
  --project family-recipe-dev \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/iam.serviceAccountTokenCreator"
```

The binding takes 10–30 seconds to propagate.

### 2. Populate `.env.dev.local`

```bash
cp .env.dev.local.example .env.dev.local
# The URLs and SA are already filled in. Append the claude-test password:
echo "CLAUDE_TEST_PASSWORD=$(gcloud secrets versions access latest \
  --secret family-recipe-dev-claude-test-password \
  --project family-recipe-dev)" >> .env.dev.local
```

`.env.dev.local` is gitignored via the existing `.env*.local` pattern.

### 3. Confirm the auth path end-to-end

```bash
source .env.dev.local
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEV_DEPLOYER_SA" \
  --audiences="$DEV_NEXT_URL")
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" "$DEV_NEXT_URL/api/health"
# Expect: HTTP 200
```

If you get 403, the tokenCreator grant from step 1 hasn't propagated yet — wait 30s and retry.

## Start / stop the dev Postgres instance

The Cloud SQL instance is declared `activation_policy = ALWAYS` in Terraform, so it normally stays running. Stop it manually to cut cost during long breaks; start it before a smoke run.

```bash
# Check current state
gcloud sql instances describe family-recipe-dev \
  --project family-recipe-dev \
  --format='value(state,settings.activationPolicy)'
# → RUNNABLE ALWAYS (running) or STOPPED NEVER (stopped)

# Stop (idle savings)
gcloud sql instances patch family-recipe-dev \
  --project family-recipe-dev \
  --activation-policy=NEVER --quiet
# Patch returns in ~15s; state becomes STOPPED NEVER.

# Start
gcloud sql instances patch family-recipe-dev \
  --project family-recipe-dev \
  --activation-policy=ALWAYS --quiet
# Patch waits for the operation to complete (~30s–2min); when the
# command returns, the instance is RUNNABLE and the smoke will pass its
# /api/health step.
```

**Other paused resources.** Both Cloud Run services have `min_instance_count=0` — they cold-start on first request (~3–5s overhead) and idle down automatically. No explicit action required; just tolerate the first-request latency.

## Run the smoke check

```bash
npm run smoke:dev
```

What this does (see [scripts/smoke-dev.sh](../../scripts/smoke-dev.sh)):

1. Mints a Bearer ID token via deployer-SA impersonation.
2. GET `/api/health` — confirms ingress auth + DB connectivity.
3. POST `/api/auth/login` with ID-token Bearer + claude-test credentials → session cookie.
4. POST `/api/posts` (multipart) — creates a tagged test post.
5. POST `/api/posts/:id/comments` (multipart) — adds a comment.
6. POST `/api/reactions` (JSON) — adds a reaction.
7. GET `/api/posts/:id` — confirms comment + reaction are visible.
8. DELETE `/api/posts/:id` — cascade-removes comment + reaction + post.
9. GET `/api/posts/:id` — confirms 404.

Exit 0 = all green. Any non-zero exit runs the cleanup trap so no test post is left behind.

## Manual probes

When you need to hit a specific endpoint the smoke script doesn't cover, mint the token once and reuse it:

```bash
source .env.dev.local
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEV_DEPLOYER_SA" \
  --audiences="$DEV_NEXT_URL")

# Cookie-jar login (for endpoints that need the session)
rm -f /tmp/fr-dev-cookies.txt
curl -sS -o /dev/null \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -c /tmp/fr-dev-cookies.txt \
  -d "$(jq -cn --arg u "$CLAUDE_TEST_USER" --arg p "$CLAUDE_TEST_PASSWORD" \
        '{emailOrUsername:$u,password:$p}')" \
  "$DEV_NEXT_URL/api/auth/login"

# Example: list timeline
curl -sS -H "Authorization: Bearer $TOKEN" -b /tmp/fr-dev-cookies.txt \
  "$DEV_NEXT_URL/api/timeline" | jq '.timelineEvents | length'
```

**Importer probe** (separate audience, same deployer SA):

```bash
IMP_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEV_DEPLOYER_SA" \
  --audiences="$DEV_IMPORTER_URL")
curl -sS -H "Authorization: Bearer $IMP_TOKEN" "$DEV_IMPORTER_URL/version"
# → {"service":"recipe-url-importer","version":"0.1.0","git_sha":"..."}
```

Each Cloud Run service is a distinct audience — mint a new token per host.

## Gotchas

- **`curl -F` interprets `;` in values** as a content-type delimiter and silently truncates the payload. Use `curl --form-string` for `multipart/form-data` JSON payloads (the smoke script does; so must your manual probes).
- **ID tokens are audience-scoped.** The token minted for `$DEV_NEXT_URL` will 401 against `$DEV_IMPORTER_URL`. Mint one per service.
- **The cookie jar's `session` cookie is tied to the Next.js host.** Reusing the same jar across Next + importer requests is harmless (the importer ignores cookies) but don't expect it to carry identity.
- **Rate limits are per-runtime-instance.** If the dev Cloud Run service has been warm, prior traffic counts against your quota. A 429 on `/api/posts` means either a bug or you genuinely sent too many — re-run after ~60s.
- **`claude-test` lives alongside real family data.** Its posts are family-scoped to the real `Wnorowski Family Recipe` space, so family members _can_ see the smoke post during its short lifetime. Keep run times short; always let the script clean up.

## Seeding / rotating the `claude-test` user

The user was seeded once via Cloud SQL Auth Proxy + `npm run db:seed` with `CLAUDE_TEST_PASSWORD` sourced from `family-recipe-dev-claude-test-password`. Re-run only to rotate the password or recreate after a DB reset:

```bash
# Start the Auth Proxy on a free local port
cloud-sql-proxy family-recipe-dev:us-east1:family-recipe-dev --port 5435 &
PROXY_PID=$!

# Fetch creds from GSM
DB_PASSWORD=$(gcloud secrets versions access latest \
  --secret family-recipe-dev-db-password --project family-recipe-dev)
CLAUDE_PW=$(gcloud secrets versions access latest \
  --secret family-recipe-dev-claude-test-password --project family-recipe-dev)

# Seed (idempotent; upserts by email)
DATABASE_URL="postgresql://family_app:${DB_PASSWORD}@127.0.0.1:5435/family_recipe_dev?sslmode=disable" \
CLAUDE_TEST_PASSWORD="$CLAUDE_PW" \
NODE_ENV=development \
npm run db:seed

kill $PROXY_PID
```

To rotate the password, add a new version to the GSM secret, re-run the block above, and update any shell/`.env.dev.local` copies.
