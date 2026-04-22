# Prisma schema verification

Run this when the change edits any `prisma/schema*.prisma` file or adds a migration. Multi-schema context: [prisma/CLAUDE.md](../../prisma/CLAUDE.md).

Schema changes are the single most cross-cutting thing in this repo. They can break:

- the Next monolith (TypeScript Prisma client)
- the FastAPI service (Python Prisma client)
- any integration test that touches the affected model
- the Cloud Run docker image's startup migration
- family-scoping invariants if a new relation is added without the right filter

Both schemas must describe the same domain.

## Edit both schemas in lock-step

| File                                                                                                 | Used by                                       | Workflow                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| [prisma/schema.postgres.node.prisma](../../prisma/schema.postgres.node.prisma) (postgres, JS client) | Local Next dev, Docker / Cloud Run Next image | `prisma db push` locally; `prisma migrate deploy` in the image |
| [prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma) (postgres)                      | FastAPI (Python client), Cloud SQL migration  | `prisma migrate dev`                                           |

A new field/model/relation must appear in **both** with the same name, shape, and `@map(...)` column name. Miss one and CI catches it only partway — the runtime fails at the boundary. SQLite support was dropped in #80; don't add a third schema back.

## After editing

```bash
# 1. Generate clients
npm run db:generate                                           # Node client (schema.postgres.node.prisma)
npx prisma generate --schema prisma/schema.postgres.prisma    # Python/FastAPI base schema

# 2. Apply schema to local Postgres (no migration file)
npm run db:push

# 3. Create a Postgres migration (commit the generated file)
npx prisma migrate dev --schema prisma/schema.postgres.prisma --name <short-change>
```

The Python client for FastAPI:

```bash
cd apps/api && source .venv/bin/activate
npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

## Verify the TypeScript side compiles

```bash
npm run type-check
```

If a field was renamed, every downstream file that referenced it will break here. Fix before proceeding.

## Verify the Next API still works

Pick one route that queries the changed model and run the [next-api.md](next-api.md) loop against it. For new models, also run a unit test that writes + reads through the relation.

If the change added a relation, **grep for `familySpaceId` in the new queries**. Any query on Post/Comment/Reaction/Favorite/CookedEvent/etc. must scope by family. Missing = cross-family leak.

## Verify the FastAPI side

```bash
cd apps/api && source .venv/bin/activate
mypy src           # catches Pydantic / client-type drift
pytest tests/
```

Then run the [fastapi.md](fastapi.md) loop on the mirror route.

## Gotchas

- **Field naming**: TypeScript camelCase maps to snake_case columns (`familySpaceId` → `@map("family_space_id")`). Both must be set on every new field.
- **Storage keys** (`avatarStorageKey`, `photoStorageKey`, etc.) historically live in columns still named `*_url` (`@map("avatar_url")`, `@map("photo_url")`). **Don't rename the column** — just the property.
- **Reaction polymorphism**: adding a reaction target requires updating both `targetType`/`targetId` (the canonical pair) and the nullable `postId`/`commentId` FKs used for join performance.
- **Cascades**: most user/post/comment deletes cascade. `FeedbackSubmission` uses `SetNull` so feedback survives user deletion — don't change to cascade.
- **Migration rollback**: there is no formal rollback path. A bad migration ships with the next deploy; plan forward-only fixes.

## Migration file review checklist

Open the generated migration SQL before committing:

- [ ] No destructive `DROP TABLE` / `DROP COLUMN` on a column with live data (rename + copy + drop across two migrations instead)
- [ ] `DEFAULT` values set for new `NOT NULL` columns on existing tables
- [ ] Indexes added for any new FK or frequently-filtered column
- [ ] No surprise changes to unrelated tables (Prisma sometimes regenerates FK names)

## Seeding

`npm run db:seed` is idempotent — it skips if a `FamilySpace` already exists. After a schema change that affects seed data (new tag category, new default row), update [prisma/seed.ts](../../prisma/seed.ts) and re-run against a fresh Postgres DB (drop and re-create the container or the `family_recipe_dev` database):

```bash
docker exec family-recipe-pg psql -U family_app -d postgres -c \
  "DROP DATABASE IF EXISTS family_recipe_dev; CREATE DATABASE family_recipe_dev OWNER family_app;"
npm run db:push
npm run db:seed
```

## Before opening the PR

```bash
npm run type-check                   # catches TS client drift
npx prisma validate --schema prisma/schema.postgres.prisma
npx prisma format --check prisma/schema.postgres.prisma   # CI runs this
npm run db:drift-check               # replays migrations, diffs vs both schemas (CI-enforced)
npm test
```

`db:drift-check` needs a throwaway Postgres — set `DATABASE_URL` to a DB you don't care about (not `family_recipe_dev`). In CI, the `prisma-drift-check` job spins up a fresh `postgres:16` service container for this.

If FastAPI tests also exist for the affected model:

```bash
cd apps/api && source .venv/bin/activate && pytest tests/
```
