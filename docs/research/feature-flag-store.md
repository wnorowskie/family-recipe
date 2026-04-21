# Feature-Flag Backing Store — Provider Decision

Decision doc for the flag system gating `USE_FASTAPI_AUTH`, `USE_FASTAPI_DATA`, and `USE_REFRESH_TOKEN_FLOW` during the [FastAPI migration](../API_BACKEND_MIGRATION_PLAN.md). Unblocks Phase 0 ([#34](https://github.com/wnorowskie/family-recipe/issues/34)) and Phase 4 canary ([#38](https://github.com/wnorowskie/family-recipe/issues/38)). Spike ticket: [#39](https://github.com/wnorowskie/family-recipe/issues/39).

## Decision (TL;DR)

Add a single `FeatureFlag` table to all three Prisma schemas. Both Next.js and FastAPI read it via a thin evaluator with a **30-second in-process cache** (lazy refresh on first read after TTL — no polling). Each flag has a global `enabled` switch, an integer `rolloutPercent`, and a comma-separated `enabledUserIds` allowlist. Evaluation is `allowlist → percent hash(userId + key) % 100 < rolloutPercent → off`. No external provider, no new service to run, zero marginal infra cost.

The canary plan in the migration plan lists 5% → 25% → 50% → 100%, but at ~5 real family users those percentages don't map to whole users. The **allowlist is the real rollout knob**; `rolloutPercent` is kept for the cost of one integer column and becomes useful if the product scales.

## Why not an external provider

| Option                   | Fit                                                                                                                                       | Cost / yr (realistic)  | Verdict    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------- |
| **DB-backed (this doc)** | Perfect. Reuses Cloud SQL, cache TTL meets 60s hot-reload, per-user allowlist works at 5-user scale.                                      | ~$0                    | **Chosen** |
| env-only + redeploy      | Misses the 60s hot-reload target (Cloud Run redeploy is 2–4 min). No per-user toggle without a redeploy.                                  | $0                     | Rejected   |
| ConfigCat                | Free tier technically fits (10 flags, 2 envs) — but adds an external hard dependency on the auth hot path for zero benefit at this scale. | $0 free / $1,188 Pro   | Rejected   |
| LaunchDarkly             | No free tier. Starter plans start around $200/mo for a team this size.                                                                    | ~$2,400+               | Rejected   |
| GrowthBook (self-host)   | Full Node.js service + its own DB. More ops surface than the thing it replaces.                                                           | ~$180 (Cloud Run + DB) | Rejected   |
| Unleash (self-host)      | Same shape as GrowthBook.                                                                                                                 | ~$180                  | Rejected   |

Pricing is approximate and vendor-subject-to-change — check current pricing before reconsidering. The point isn't the dollar delta; it's that any external provider adds a network dependency on a path we control entirely with one table.

## Proposed Prisma Schema

Copy into all three schemas ([prisma/schema.prisma](../../prisma/schema.prisma), [prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma), [prisma/schema.postgres.node.prisma](../../prisma/schema.postgres.node.prisma)) — per [prisma/CLAUDE.md](../../prisma/CLAUDE.md) the three schemas must stay field-identical.

```prisma
model FeatureFlag {
  id             String   @id @default(cuid())
  key            String   @unique                       // 'USE_FASTAPI_AUTH', etc.
  enabled        Boolean  @default(false)               // global kill-switch
  rolloutPercent Int      @default(0) @map("rollout_percent")
  enabledUserIds String   @default("") @map("enabled_user_ids") // comma-separated
  note           String?                                // free-form ops note
  updatedAt      DateTime @updatedAt @map("updated_at")
  updatedBy      String?  @map("updated_by")            // userId of last editor

  @@map("feature_flags")
}
```

**Why this shape:**

- `enabledUserIds` as a comma-separated string, not `String[]`, because Prisma arrays don't cross the SQLite/Postgres providers we use ([prisma/CLAUDE.md](../../prisma/CLAUDE.md)) — same reason `RefreshToken.revokedReason` is `String?` in [refresh-token-store.md](refresh-token-store.md). Parse to `Set<string>` on read. At ≤10 users the size is a rounding error.
- `rolloutPercent` as `Int` 0–100 (validated at write time). Kept for future scale; see "Percentage rollout at 5-user scale" below.
- No separate `environment` column — **dev and prod already run against separate databases** (local SQLite / dev Cloud SQL / prod Cloud SQL), so each env has its own `feature_flags` rows by construction. Adding an env column would force both environments into one table and re-introduce a filter that's currently enforced by connection-string separation.
- `note` + `updatedBy` give forensic signal ("who flipped `USE_FASTAPI_AUTH` at 2am?") without a separate audit table. A dedicated audit log isn't worth a second table at this scale; if we need history later, a `feature_flag_audits` table is cheap to add.

## Evaluation

Identical semantics in TS ([src/lib/featureFlags.ts](../../src/lib/featureFlags.ts) — new) and Python ([apps/api/src/services/feature_flags.py](../../apps/api/src/services/feature_flags.py) — new):

```
isEnabled(userId: string, key: string) -> boolean:
  flag = loadFlag(key)                  // cache-backed, see below
  if flag is None: return false          // unknown flag = off (fail closed)
  if not flag.enabled: return false
  if userId in flag.enabledUserIds: return true
  if flag.rolloutPercent >= 100: return true
  if flag.rolloutPercent <= 0:   return false
  bucket = fnv1a(userId + ':' + key) % 100
  return bucket < flag.rolloutPercent
```

Hash must be **stable across languages** so the same user lands in the same bucket on Next and FastAPI (otherwise a single request can write to one backend and read from the other). FNV-1a 32-bit is trivial to reimplement identically; `hashlib.md5` truncated to 4 bytes works too. Pick one and lock it in.

**Fail closed** on unknown flag keys: if somebody adds `USE_NEW_FOO` in code without a migration, it evaluates to `false` until the row exists. Matches what env-var defaults would have given us.

## Caching & Hot-Reload

Per-process in-memory cache, **lazy refresh, no polling**:

```
loadFlag(key):
  entry = cache.get(key)
  if entry and entry.loadedAt > now() - 30s: return entry.flag
  row = db.featureFlag.findUnique({ where: { key }})
  cache.set(key, { flag: row, loadedAt: now() })
  return row
```

- **30s TTL** → a flip propagates to every instance within 30s without any polling background job. Well under the migration plan's 60s target and 5min rollback SLA.
- **Lazy on read** means zero queries when no one is checking flags, and one query per instance per flag per 30s when traffic exists. At 1 Cloud Run instance × 3 flags that's 360 queries/hour — negligible, and the row is 1 KB.
- **Not lazy on write**: flag writers (admin endpoint, seed) should also bust their own local cache so the UI round-trip after save reflects the new value.
- No distributed cache / no pub-sub. Current prod is single-instance Cloud Run. If we ever scale horizontally, 30s is still the staleness budget; if that becomes too loose, the fix is to shorten TTL (not to add Redis).

Acceptable edge case: during the 30s window after a flip, different instances (or different requests hitting a rolling deploy) can return different values for the same user. At 5 users this is invisible; the migration plan's dual-stack write protection ([API_BACKEND_MIGRATION_PLAN.md, "Dual‑Stack Without Data Drift"](../API_BACKEND_MIGRATION_PLAN.md)) already assumes brief inconsistency during a flip.

## Percentage Rollout at 5-User Scale

The migration plan's Phase 4 lists a 5% → 25% → 50% → 100% canary. At 5 users those percentages round to 0 / 1 / 2–3 / 5 — the math doesn't produce a useful "small fraction" signal. The real rollout strategy at this scale is:

1. `enabledUserIds = ["<your-user-id>"]` — dogfood for a few days.
2. Add one more family member to `enabledUserIds` — still allowlist mode.
3. `rolloutPercent = 100, enabled = true, enabledUserIds = ""` — done.

`rolloutPercent` stays in the schema because (a) it's one column, (b) it lets us write the evaluator once for now-and-future scale, (c) it's useful in dev where the allowlist doesn't map to real users. It is **not** the primary rollout lever; the allowlist is.

## Admin Surface

**V1**: [Prisma Studio](https://www.prisma.io/studio) (`npm run db:studio`) + the [seed script](../../prisma/seed.ts). No admin UI.

- Seed inserts the three migration flags with `enabled=false, rolloutPercent=0, enabledUserIds=""`.
- Flipping is a Studio edit against the prod Cloud SQL instance — one authenticated person, rare ops.
- Writes bump `updatedAt` automatically; set `updatedBy` manually (it's there for the audit trail, not for runtime behavior).

**V2 (if needed)**: `PATCH /v1/admin/flags/{key}` behind `withRole('owner')`. Deferred until we need off-laptop flag flips or multiple operators. Same table, same evaluator — it's purely a write path.

## Rollback

1. Operator flips `enabled=false` in Prisma Studio (or via the admin endpoint if V2 landed).
2. Within 30s every process sees the change on its next cache expiry.
3. Dual-mode write gating in FastAPI returns `409 CONFLICT` on the disabled path; the frontend falls back to the still-live Next route.

End-to-end: **< 60s** from the click to every in-flight instance. Migration plan's SLA is < 5min; we beat it by 10×.

## Frontend Integration

Next.js evaluates flags **server-side** (in server components and server actions) using the authenticated user's ID. Results are passed to client components as props — the client never queries the flag table directly.

For client-initiated fetches that need to know which backend to call (e.g. after a `USE_FASTAPI_DATA` flip during an active session), add **`GET /api/flags/me`** (Phase 0) / **`GET /v1/flags/me`** (post-cutover): returns the caller's evaluated flag map. Client caches for 30s. This keeps flag evaluation on the server where the cache lives.

## Implementation Checklist (for Phase 0 ticket #34)

1. Add `FeatureFlag` to all three Prisma schemas; generate Postgres migration via `npx prisma migrate dev --schema prisma/schema.postgres.prisma --name add_feature_flags`. `npm run db:push` for SQLite.
2. Add `src/lib/featureFlags.ts` with `isEnabled(userId, key)` + 30s cache.
3. Add `apps/api/src/services/feature_flags.py` with identical semantics and the **same hash function**.
4. Extend [prisma/seed.ts](../../prisma/seed.ts) to upsert the three migration-plan flags as disabled.
5. Add `GET /api/flags/me` returning `{ USE_FASTAPI_AUTH: bool, ... }` for the authenticated user; mirror to FastAPI as `/v1/flags/me`.
6. Unit test the evaluator against a fixed hash fixture to guarantee TS/Python bucketing agrees.
7. Update [docs/API_BACKEND_MIGRATION_PLAN.md §"Feature Flag Enforcement Source"](../API_BACKEND_MIGRATION_PLAN.md) to replace "environment‑backed config (`FASTAPI_FEATURE_FLAGS`) loaded on startup and reloaded on interval" with a pointer to this doc.

## Alternatives Considered (and Rejected)

- **env-only + redeploy.** Simplest, but Cloud Run redeploys take 2–4 minutes, miss the 60s hot-reload target, and force a full deploy per allowlist change. Works fine for compile-time defaults; insufficient for runtime gating during a migration.
- **DB table with `String[]` for allowlist.** Nicer API, but Prisma array types don't cross SQLite. Same reasoning as `revokedReason` in [refresh-token-store.md](refresh-token-store.md).
- **Separate `environment` column keyed by `NODE_ENV`.** Dev and prod already live in separate databases; adding this column duplicates an axis we already split on connection string.
- **Pub-sub / Redis invalidation for instant propagation.** Added infra for a 30s win that nobody will notice at this scale. Revisit if we go horizontal on Cloud Run.
- **Audit log table from day one.** `updatedAt` + `updatedBy` + `note` cover the 95% case of "who last touched this?" A full `feature_flag_audits` table is a cheap follow-up if we ever need retention or queries per-flag-per-time.
- **LaunchDarkly / ConfigCat / GrowthBook / Unleash.** All solve this problem. None solve it better than one table at 5 users, and each adds either dollars, ops surface, or a network dependency on a hot path. Revisit when we have >1 team, >2 environments, or a product manager who wants to flip flags without asking engineering.
