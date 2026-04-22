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

To rotate the master key, do it manually via the DB — there is no API for it.

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
