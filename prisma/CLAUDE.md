# CLAUDE.md — `prisma/`

## Two schemas, one domain

| File                                                       | Provider                   | Used by                                                  | Workflow                                                           |
| ---------------------------------------------------------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| [schema.postgres.node.prisma](schema.postgres.node.prisma) | postgresql, JS client only | Local Next dev, Docker / Cloud Run Next.js image         | `prisma db push` locally; `prisma migrate deploy` in the image     |
| [schema.postgres.prisma](schema.postgres.prisma)           | postgresql                 | FastAPI ([apps/api/](../apps/api/)), Cloud SQL migration | `prisma migrate deploy` — migrations in [migrations/](migrations/) |

Local dev uses **the `.node.` schema** — it's what the Next runtime expects and it's the one the `npm run db:*` scripts point at. The plain `schema.postgres.prisma` exists for the Python client (FastAPI) and Cloud SQL migrations.

**The two schemas must stay field-identical** — every model, field, `@map(...)` column name, `@db.*` type annotation, and `@@index(..., map: "...")` name has to appear in both. Anything you add or change should land in both schemas in lock-step:

1. Edit both schemas together.
2. Generate a migration against the Postgres schema: `npx prisma migrate dev --schema prisma/schema.postgres.prisma --name <change>`.
3. Re-run `npm run db:generate` to refresh the Node client, and the Python client from `apps/api/` if FastAPI is in use.

> SQLite support was removed in #80. `Notification.emojiCounts` and `metadata` are `Json?`, which the SQLite connector rejects — the default schema was non-functional and nothing at runtime depended on it.

## Selecting a schema at runtime

The `DATABASE_URL` env var picks the connection. `PRISMA_SCHEMA` is read by Prisma CLI commands (e.g., the docker entrypoint runs `prisma migrate deploy --schema $PRISMA_SCHEMA`). The runtime client just trusts whatever was generated.

## Seeding ([seed.ts](seed.ts))

`npm run db:seed` runs the script. It:

- Creates one `FamilySpace` if none exists, hashing `FAMILY_MASTER_KEY` (or generating one and **printing it** — save the output).
- Loads the curated tag catalog (diet/allergen/heat/flavor/cuisine).
- Will not overwrite an existing family or rotate the master key.
- Skipped in `NODE_ENV=production`: seeds the `claude-test` dev user (credentials from `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD`, defaults in [seed.ts](seed.ts)).

To rotate the master key, do it manually via the DB — there is no API for it.

### `SEED_E2E=1` — Playwright fixture bundle

Setting `SEED_E2E=1` (alongside the default non-prod `NODE_ENV`) adds a deterministic fixture set on top of the baseline seed, for the Playwright smoke suite (#58 / #102):

- one post (`id='e2e-post-001'`, title `E2E Seed Post`) authored by `claude-test`
- one comment on that post (`id='e2e-comment-001'`)
- one reaction on that post (`id='e2e-reaction-001'`, emoji `❤️`)
- one recipe post (`id='e2e-recipe-001'`, title `E2E Seed Recipe`, `hasRecipeDetails=true`) with `RecipeDetails`
- one cooked event against the recipe (`id='e2e-cooked-001'`, rating 5)
- one notification for `claude-test` (`id='e2e-notification-001'`, type `comment`)

All upserts keyed on the deterministic IDs, so re-running `SEED_E2E=1 npm run db:seed` does not duplicate rows. Specs assert by ID or content (`E2E Seed Post`, etc.). Ignored when `NODE_ENV=production` or `SEED_E2E` is unset.

## Drift check (CI-enforced)

Every PR runs [scripts/check-prisma-drift.sh](../scripts/check-prisma-drift.sh) via the `prisma-drift-check` job in [ci.yml](../.github/workflows/ci.yml). The script replays `prisma/migrations/` into a throwaway Postgres, then runs `prisma migrate diff` against both Postgres schemas. A non-empty diff in either direction fails the job, which is how we enforce the two-schemas-in-lockstep rule (and catches missing `@db.Timestamptz(6)`, forgotten `@default(now())`, divergent cascade actions, index-name mismatches, etc.).

To reproduce locally:

```bash
# any throwaway Postgres; `public` schema is dropped/recreated by the script
DATABASE_URL=postgresql://family_app:dev-only-password@localhost:5434/drift_check \
  npm run db:drift-check
```

When CI fails, the diff is printed as SQL — apply the suggested fix to whichever side is wrong (usually the schema, sometimes a follow-up migration).

**Migration apply order**: the script applies migrations lexicographically with a retry pass, so a migration that references tables created by a later-named migration (e.g. `20250225210000_add_feedback_submissions` referencing `users`/`family_spaces` from `20251130224838_add_recipe_courses`) still applies. If you add a new migration that only works after a later one, it'll apply on pass 2. A migration that can't apply after any number of passes — a genuine error — fails the job with the underlying Postgres error.

## Schema gotchas

- **Field naming**: TypeScript camelCase (`familySpaceId`) maps to snake_case columns (`@map("family_space_id")`). Always set both when adding fields.
- **Storage keys**: photo/avatar columns store opaque storage keys but historically were named `*_url` in the DB (`@map("avatar_url")`, `@map("url")`, `@map("photo_url")`). Don't rename the column — the property is what code uses.
- **Reaction polymorphism**: `Reaction` has both `targetType`/`targetId` (the canonical pair, with the unique constraint) AND nullable `postId`/`commentId` FKs (for join performance). When inserting, set both representations.
- **Notification batching**: reactions roll up into one `Notification` per `(recipientId, postId)` with `emojiCounts` JSON; comments and cooked events are 1:1.
- **Cascades**: most relations cascade on user/post/comment delete. `FeedbackSubmission` uses `SetNull` so feedback survives user deletion.

## After schema changes

Always run `npm run type-check` — Prisma generates TS types and downstream code will fail to compile if a field name shifts.

## Verification

Before opening a PR that touches any schema or migration, run the [Prisma playbook](../docs/verification/prisma.md) — covers the two-schema lock-step edit, migration SQL review checklist, and the downstream Next + FastAPI checks.
