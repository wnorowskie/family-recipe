# Refresh Token Store — Schema & Rotation Design

Decision doc for the refresh-token backing store that Phase 1 of the FastAPI migration ([API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md)) needs before handler code is written. Unblocks [#35](https://github.com/wnorowskie/family-recipe/issues/35). Spike ticket: [#40](https://github.com/wnorowskie/family-recipe/issues/40).

## Decision (TL;DR)

Add a single `RefreshToken` table to all three Prisma schemas, keyed by an opaque `jti` prefix and storing an **HMAC-SHA-256 hash** of the token (pepper in secret manager). Every `/refresh` **always rotates** and emits a new row in the same `chain_id`. Reuse of an already-rotated `jti` revokes the **whole chain** (not the user's other sessions). Expired/revoked rows are purged by a daily Cloud Scheduler job. No admin denylist table — per-user `/logout-all` plus a global `AUTH_EPOCH` env var cover the "nuclear" cases.

## Proposed Prisma Schema

Copy into all three schemas ([prisma/schema.prisma](../../prisma/schema.prisma), [prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma), [prisma/schema.postgres.node.prisma](../../prisma/schema.postgres.node.prisma)) — per [prisma/CLAUDE.md](../../prisma/CLAUDE.md), the three schemas must stay field-identical.

```prisma
model RefreshToken {
  id             String    @id @default(cuid())
  userId         String    @map("user_id")
  familySpaceId  String    @map("family_space_id")
  jti            String    @unique
  tokenHash      String    @map("token_hash")          // HMAC-SHA256(REFRESH_PEPPER, token)
  chainId        String    @map("chain_id")            // shared across all rotations from a single login
  rotatedFromJti String?   @map("rotated_from_jti")
  rememberMe     Boolean   @default(false) @map("remember_me")
  issuedAt       DateTime  @default(now()) @map("issued_at")
  expiresAt      DateTime  @map("expires_at")
  revokedAt      DateTime? @map("revoked_at")
  revokedReason  String?   @map("revoked_reason")      // 'rotated' | 'logout' | 'logout_all' | 'reuse_detected' | 'admin'
  userAgent      String?   @map("user_agent")
  ipAddress      String?   @map("ip_address")

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  familySpace FamilySpace @relation(fields: [familySpaceId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
  @@index([userId, revokedAt])
  @@index([chainId])
  @@index([familySpaceId])
  @@index([expiresAt])
}
```

Back-relations on `User` and `FamilySpace`: `refreshTokens RefreshToken[]`.

**What changed vs. the ticket's baseline:** added `id`, `family_space_id`, `chain_id`, `revoked_reason`, `user_agent`, `ip_address`.

- `id` — matches every other model's primary-key convention (cuid), keeps Prisma relations ergonomic.
- `family_space_id` — family scoping is the implicit security boundary everywhere else per root [CLAUDE.md](../../CLAUDE.md); keep the pattern so future admin queries don't accidentally leak cross-tenant.
- `chain_id` — enables chain-scoped reuse revocation (see below). Without it, the only options are revoke-just-this-jti (too narrow, attacker keeps going) or revoke-all-user-tokens (too wide, kicks out the user's other devices).
- `revoked_reason` — minimal forensics; cheap to populate, lets us answer "did the user log out or did we detect reuse?" without digging through logs.
- `user_agent` / `ip_address` — optional, recorded at issuance; used to render a "signed-in devices" list and to enrich the security event log on reuse detection. **Flag for the owner to sign off on:** this is a deliberate shift from log-only to DB-persisted storage of UA/IP. Log rotation currently bounds how long we keep this data; rows in `refresh_tokens` live until the cleanup cron (expiry + 7d, or revoked + 30d). Real family users are the audience — if we'd rather keep UA/IP in logs only, drop both columns and enrich the security event from the request at detection time (we lose the "compare new IP to issuance IP" trick in the log, which is the main reason to persist them).

## Indexes & Lookup Path

Hot path is `/refresh`: `SELECT … WHERE jti = ?`. The `@unique` on `jti` creates a b-tree → O(log n) per lookup at any realistic scale.

| Index                    | Serves                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `jti` (unique)           | `/refresh` lookup                                             |
| `(user_id, revoked_at)`  | `/logout-all`, session-list queries                           |
| `chain_id`               | Chain revocation on reuse detection                           |
| `family_space_id`        | Admin queries and future multi-tenant scoping                 |
| `expires_at`             | Nightly cleanup job                                           |

At family-app scale (≤50 rows/user, ≤100 users) the indexes cost more than they save on read, but they're free insurance for when the same table powers multi-tenant use. Storage overhead is ~a few KB per user and isn't worth optimizing.

## Token Format on the Wire

Cookie value: `{jti}.{random}` where `random` is 32 bytes of CSPRNG output, base64url-encoded.

- The `jti` prefix is the **lookup key** — plaintext, non-secret. Avoids a table scan to find the row.
- The `random` half is the secret. Never stored raw; stored as `token_hash = HMAC_SHA256(REFRESH_PEPPER, random)`.
- A split format (rather than putting the whole secret under a single hashed column and scanning) is the same approach GitHub's PAT format and Django's `django-rest-knox` take.

## Hash Algorithm — HMAC-SHA-256

**Decision: HMAC-SHA-256 with a server-side pepper (32-byte secret, stored in GCP Secret Manager as `REFRESH_PEPPER`).**

Why not bcrypt/argon2: those are designed to slow brute-force against **low-entropy human passwords**. A refresh token is 256 bits of CSPRNG — it is already unbrute-forceable. Bcrypt would add ~100ms of CPU per `/refresh` call for zero marginal security.

Why not plain SHA-256: a DB dump alone would let an attacker recognize tokens they already hold by re-hashing them. The pepper (stored outside the DB) means a DB-only dump is useless without Secret Manager access — a meaningful defense-in-depth win.

Use constant-time comparison (`hmac.compare_digest` in Python, `crypto.timingSafeEqual` in Node). Rotation of the pepper is possible by keeping two peppers live during a transition window; not needed day-one.

**References:** OWASP Session Management Cheat Sheet, Auth0 "Refresh Token Rotation" guide, `django-rest-knox` source.

## Rotation & Reuse Detection Flow

### `/login` (and `/signup`)

1. Verify credentials.
2. `jti = uuid4()`, `chainId = uuid4()`, `token = secrets.token_urlsafe(32)`.
3. `tokenHash = hmac_sha256(REFRESH_PEPPER, token)`.
4. `expiresAt = now() + (rememberMe ? 30d : 7d)` (policy below).
5. `INSERT refresh_tokens (jti, chain_id=chainId, rotated_from_jti=NULL, …)`.
6. Return `{ accessToken }`; set `refresh_token` cookie to `{jti}.{token}`.

### `/refresh`

1. Parse cookie → `(jti, token)`.
2. `SELECT * FROM refresh_tokens WHERE jti = ?` (unique index).
3. Validate **in this order**, tracking which check failed:
   - row exists
   - `expires_at > NOW()`
   - `revoked_at IS NULL`
   - `tokenHash` matches via `compare_digest`
4. If **any check fails on a row whose `revoked_reason = 'rotated'`**, treat as reuse:
   ```
   UPDATE refresh_tokens
   SET revoked_at = NOW(), revoked_reason = 'reuse_detected'
   WHERE chain_id = (the row's chain_id) AND revoked_at IS NULL;
   ```
   Log a security event (`userId`, `chainId`, current `ipAddress` vs. row's `ipAddress`, UAs). Return 401; client logs in again.
5. Otherwise, rotate (inside a single transaction — see concurrency below):
   - Mark the current row `revoked_at = NOW(), revoked_reason = 'rotated'`.
   - Insert a fresh row: same `chain_id`, `rotated_from_jti = old_jti`, `remember_me` **copied from the old row**, new `jti`/`token`/`tokenHash`, `expires_at = now() + TTL` (TTL derived from the carried-forward `remember_me`).
   - Issue a new access token, set new refresh cookie.

### Concurrency

Issue [#35](https://github.com/wnorowskie/family-recipe/issues/35)'s AC requires that concurrent `/refresh` calls don't issue duplicate tokens or lose reuse detection. Two recipes both work; pick one at implementation time:

- **Preferred: `SELECT … FOR UPDATE` inside a transaction.** The lookup at step 2 becomes `SELECT … WHERE jti = ? FOR UPDATE`, and the revoke + insert at step 5 run in the same transaction. The second concurrent caller blocks on the row lock, then sees `revoked_reason = 'rotated'` when it unblocks and correctly triggers chain-reuse detection. Works cleanly on Postgres; SQLite's `BEGIN IMMEDIATE` gives equivalent serialization for local dev.
- **Alternative: short grace window.** Allow a just-rotated row to still mint one successor if used within e.g. 5s of its own rotation, as long as the successor's hash matches. Avoids false positives from legitimate double-submits (tab re-opens, retry-on-transient-error) without opening a meaningful attacker window. More moving parts; only worth it if we see reuse-detection false positives in practice.

### Reuse escalation — narrower case

The reuse trigger at step 4 fires only on a row whose `revoked_reason = 'rotated'`. A cookie replayed against a row whose reason is `'logout'`, `'logout_all'`, or `'reuse_detected'` returns 401 but does **not** escalate to chain revocation. Rationale: those rows were revoked by the legitimate user or by a prior detected-compromise event — there's no new signal to act on. A replay on a `'logout'` row most likely means the attacker had the cookie before logout; the chain is either already dead or unrelated to the current session.

### `/logout`

`UPDATE … SET revoked_at = NOW(), revoked_reason = 'logout' WHERE jti = ? AND revoked_at IS NULL;` Clear cookie.

### `/logout-all`

`UPDATE … SET revoked_at = NOW(), revoked_reason = 'logout_all' WHERE user_id = ? AND revoked_at IS NULL;` Clear cookie.

### Reuse — why revoke the chain, not the whole user

A user can legitimately have multiple live sessions (phone + laptop + tablet). Each login starts a new `chain_id`. If an attacker steals one session's cookie and tries to refresh it, only **that chain** is compromised — revoking the other chains would log the user out of trusted devices for no gain. This matches Auth0's, Okta's, and OWASP's recommended semantics.

Escalation to full-user revocation is available manually (`/logout-all`) if the user recognizes the security event and doesn't trust any of their sessions.

### Remember-me policy

- `rememberMe = false` → TTL 7d.
- `rememberMe = true` → TTL 30d.
- Rotation always happens on refresh, regardless of `rememberMe`.
- The flag is set at login and **carried across rotations** (stored on every row in the chain) so remember-me doesn't silently degrade after the first refresh.

30d is the upper bound here, not the 30–90d the migration plan originally listed — the app has real family users already, and a 90-day stolen-cookie window is a lot longer than the actual convenience gain of "not signing in monthly." We can raise it later with a single config change if feedback says so.

## Cleanup

Daily [Cloud Scheduler](https://cloud.google.com/scheduler) → Cloud Run job at 03:00 UTC:

```sql
DELETE FROM refresh_tokens
WHERE (expires_at < NOW() - INTERVAL '7 days')
   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days');
```

- **Grace periods** (7d expired, 30d revoked) keep rows around long enough for incident forensics.
- **Not** lazy-on-read: `/refresh` already filters on `expires_at` / `revoked_at`; the DELETE is only there to cap table growth. Doing it lazily mixes concerns and makes the refresh path harder to reason about.
- **Not** background-on-write: adds p99 latency spikes on `/refresh`, which is the one endpoint we want predictable.
- SQLite local dev: skip. Table size stays trivial.

## Admin Denylist — Not Needed

The ticket asks whether we need an admin denylist for emergency session kill. Three scenarios:

1. **Kick one user** → `/logout-all` for that userId. Single UPDATE, no new table.
2. **Rotate all access tokens** (e.g., we rotate the JWT signing key) → bump `AUTH_EPOCH` env var and include it in the access-token claims; mismatch → 401. No DB writes, no refresh-side work.
3. **Kick every session globally** (worst case: DB compromise, pepper compromise) → `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'admin' WHERE revoked_at IS NULL;` — one SQL statement, no new table.

A separate denylist table would add a lookup on every `/refresh` for a feature we'd use approximately never. Revisit only if we land per-session granular admin controls (e.g., "kill just the session from this IP across all users").

## Schema-Variant Consistency

Per [prisma/CLAUDE.md](../../prisma/CLAUDE.md), edit all three schemas in lock-step. No SQLite-incompatible types used here (`DateTime`, `String`, `Boolean` all portable).

**Implementation checklist** (for the Phase 1 ticket that consumes this doc):

1. Add the `RefreshToken` model + back-relations to `schema.prisma`, `schema.postgres.prisma`, `schema.postgres.node.prisma`.
2. `npx prisma migrate dev --schema prisma/schema.postgres.prisma --name add_refresh_tokens` — commits a migration under [prisma/migrations/](../../prisma/migrations/).
3. `npm run db:push` to pick it up locally on SQLite.
4. `npm run db:generate` (Next) and `prisma generate --schema prisma/schema.postgres.prisma` (FastAPI picks up via `clientPy` generator).
5. `npm run type-check`.
6. Add `REFRESH_PEPPER` to Secret Manager, env config for Next, and the FastAPI settings module. Dev fallback acceptable; production must fail-fast if unset.

## Alternatives Considered (and Rejected)

- **bcrypt / argon2 for the token hash.** Designed for low-entropy passwords; pointless cost on 256-bit random tokens.
- **Store the token plain and compare.** A DB dump is then a session compromise. Trivial win to avoid.
- **No `chain_id`, revoke-all-user-tokens on reuse.** Kicks trusted sessions for no security gain.
- **No `chain_id`, revoke-only-this-jti on reuse.** Doesn't stop an attacker who holds the next rotated token.
- **Single long-lived refresh token, no rotation.** Removes reuse detection entirely; a stolen cookie is a permanent session.
- **Storing the token in a separate `sessions` table with N:1 refresh tokens per session.** Extra indirection for no V1 benefit; `chain_id` gives us the same "group of rotations" concept with one fewer table.
- **Admin denylist table.** Covered by `/logout-all` + `AUTH_EPOCH` + bulk UPDATE. YAGNI.
- **Lazy cleanup on read.** Mixes write concern into the hot path.
