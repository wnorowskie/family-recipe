# Next.js API verification

Run this when the change touches any `route.ts` under [src/app/api/](../../src/app/api/). Handler conventions: [src/app/api/CLAUDE.md](../../src/app/api/CLAUDE.md).

These routes are the **current production backend**. When changing a contract here, check whether the FastAPI mirror in [apps/api/src/routers/](../../apps/api/src/routers/) needs the same change — see [fastapi.md](fastapi.md).

## Start the dev server

```bash
# Default (Postgres via .env — required for any DB-touching route; see caveat below)
npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done
```

**SQLite caveat.** The previously-documented `DATABASE_URL="file:./prisma/dev.db"` override boots the server but cannot regenerate the JS Prisma client today (`Notification.emojiCounts/metadata: Json?` aren't supported by the SQLite connector, and the `Notification` model is missing from `schema.postgres.prisma`). If local Postgres isn't running, start it:

```bash
docker run -d --name family-recipe-pg \
  -e POSTGRES_USER=family_app \
  -e POSTGRES_PASSWORD=FamilyRecipe2025DbPass \
  -e POSTGRES_DB=family_recipe_dev \
  -p 5432:5432 postgres:16

# Generate the Node Prisma client against the schema the Next app actually uses
npx prisma generate --schema prisma/schema.postgres.node.prisma
npx prisma db push --schema prisma/schema.postgres.node.prisma
npm run db:seed
```

If you previously ran the FastAPI setup step (`npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy`) the **Node** client may have been overwritten against `schema.postgres.prisma`, which lacks `Notification`. Re-generate against `schema.postgres.node.prisma` (above) to recover.

## Auth — log in and capture a cookie

Every authenticated route needs a `session` cookie. Log in once per session.

```bash
COOKIES=/tmp/fr-cookies.txt

curl -s -c "$COOKIES" \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"<seeded-user>","password":"<pass>"}' \
  http://localhost:3000/api/auth/login | jq .
```

Success: `200` with a `user` object, and `$COOKIES` contains a `session` entry. Failure: `401` invalid credentials, `403` no membership, `429` rate-limited.

Reuse with `-b "$COOKIES"` on every subsequent call.

## Invariants every handler must preserve

Grep the diff and confirm each of these is still true:

- [ ] Handler is wrapped in `withAuth` / `withRole` (never reads the session manually) — see [src/lib/apiAuth.ts](../../src/lib/apiAuth.ts)
- [ ] Input goes through a Zod schema from [src/lib/validation.ts](../../src/lib/validation.ts) (not an inline schema)
- [ ] Errors use helpers from [src/lib/apiErrors.ts](../../src/lib/apiErrors.ts) (not ad-hoc `NextResponse.json({error:...})`)
- [ ] Every DB query filters by `user.familySpaceId` — missing = cross-family leak
- [ ] Mutations that change a feed or list view call `revalidatePath(...)` for the affected path(s) — not every mutation needs this; only the ones visible on `/timeline`, `/recipes`, etc.
- [ ] Rate limiter applied (see [src/lib/rateLimit.ts](../../src/lib/rateLimit.ts))

## L0 — curl the route

### Unauthenticated path

```bash
# Should return 401
curl -s -w "\n%{http_code}\n" http://localhost:3000/api/<resource> | tail -5
```

### Authenticated happy path

```bash
curl -s -b "$COOKIES" \
  -w "\nstatus=%{http_code}\n" \
  http://localhost:3000/api/<resource> | jq .
```

Confirm the JSON shape matches the Zod output schema (or the consumer's expectations).

### Validation errors

```bash
# Bad payload — expect 400 with { error: { code: "VALIDATION_ERROR", message } }
curl -s -b "$COOKIES" \
  -H "Content-Type: application/json" \
  -d '{"garbage":true}' \
  http://localhost:3000/api/<resource> | jq .
```

### Cross-family guard

When changing a by-id lookup (GET/PATCH/DELETE on `/api/posts/:id` etc.), the missing-`familySpaceId` bug is silent: the query still returns the row, just from a different family. There's no unit test that catches this if it's removed.

Quick manual probe: create a post with user A, log in as user B (different family), `GET /api/posts/:idFromA` should return `404`, not `200`.

## Multipart routes (photos)

Routes under `/api/posts` and `/api/comments` accept `multipart/form-data`:

```bash
# JSON payload in `payload` field, file in `photos`
curl -s -b "$COOKIES" \
  -F 'payload={"title":"Test","kind":"update"};type=application/json' \
  -F 'photos=@/path/to/image.jpg' \
  http://localhost:3000/api/posts | jq .

# Confirm file landed on disk
ls -l public/uploads/ | tail -5
```

The returned post row must have a non-null `storageKey`, never a rendered URL.

## Running the Jest integration test for the route

The integration suite mocks Prisma but exercises the full handler pipeline — much cheaper than curl for iterating on a single route:

```bash
npx jest __tests__/integration/api/<resource>.test.ts
```

If your change lacks an integration test, [**tests**/CLAUDE.md](../../__tests__/CLAUDE.md) shows the pattern.

## FastAPI mirror

If this change altered request/response shape, status codes, or auth behavior, also:

1. Update the equivalent router in [apps/api/src/routers/](../../apps/api/src/routers/)
2. Run [fastapi.md](fastapi.md) against the mirror
3. Check [docs/API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md) hasn't drifted

## Before opening the PR

```bash
npm run type-check
npm run lint
npm test
```

Stop the dev server: `lsof -ti :3000 | xargs -r kill -9`.
