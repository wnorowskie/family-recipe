# CLAUDE.md — `prisma/`

## Three schemas, one domain

| File                                                       | Provider                   | Used by                                                            | Workflow                                                           |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [schema.prisma](schema.prisma)                             | sqlite                     | Local Next dev (default)                                           | `prisma db push` (no migrations)                                   |
| [schema.postgres.prisma](schema.postgres.prisma)           | postgresql                 | Local Postgres dev, Cloud SQL, FastAPI ([apps/api/](../apps/api/)) | `prisma migrate deploy` — migrations in [migrations/](migrations/) |
| [schema.postgres.node.prisma](schema.postgres.node.prisma) | postgresql, JS client only | Docker / Cloud Run Next.js image                                   | `prisma migrate deploy` — uses same migrations                     |

**The three schemas must define the same models with the same field names and shape.** When adding/changing a model:

1. Edit all three schemas in lock-step.
2. For Postgres, generate a migration: `npx prisma migrate dev --schema prisma/schema.postgres.prisma --name <change>`.
3. SQLite picks up changes via `npm run db:push` — no migration file is committed for SQLite.
4. Re-run `npm run db:generate` (uses default schema) and the postgres equivalent if Python client is in use.

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

Before opening a PR that touches any schema or migration, run the [Prisma playbook](../docs/verification/prisma.md) — covers the three-schema lock-step edit, migration SQL review checklist, and the downstream Next + FastAPI checks.
