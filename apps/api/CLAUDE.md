# CLAUDE.md — `apps/api/`

FastAPI re-implementation of the Next.js JSON API. Setup, run, and test commands live in [README.md](README.md).

## Why this exists

The Next.js route handlers in [src/app/api/](../../src/app/api/) are the **current** production backend. This service is the **migration target** — when complete, the Next frontend will call FastAPI via `NEXT_PUBLIC_API_BASE_URL` and the Next API routes will be removed. See [docs/API_BACKEND_MIGRATION_PLAN.md](../../docs/API_BACKEND_MIGRATION_PLAN.md).

## Stay in sync with Next

When you change an endpoint here, check whether the equivalent in `src/app/api/` needs the same change (and vice-versa). The two services share:

- The same Prisma schema ([prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma))
- The same database
- The same JWT format and `session` cookie semantics
- The same request/response shapes (the migration plan is explicit that the contract should not change during the cutover, except for the planned `/v1/` prefix and access/refresh-token split)

The Python Prisma client is generated from the postgres schema:

```bash
npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

## Module layout

- [src/main.py](src/main.py) — FastAPI app, includes routers, manages prisma connect/disconnect lifespan
- [src/routers/](src/routers/) — one file per resource, mirrors [src/app/api/](../../src/app/api/) structure
- [src/dependencies.py](src/dependencies.py) — auth dependency injectors (the FastAPI equivalent of `withAuth`)
- [src/permissions.py](src/permissions.py) — mirrors [src/lib/permissions.ts](../../src/lib/permissions.ts)
- [src/security.py](src/security.py) — JWT verify, password hashing
- [src/schemas/](src/schemas/) — Pydantic request/response models (mirrors `validation.ts` + `apiErrors.ts`)
- [src/uploads.py](src/uploads.py) — signed URL resolution for GCS

## Testing

`pytest tests/unit/` for unit tests, `pytest tests/integration/` for integration. CI runs both plus ruff, mypy, trivy, pip-audit, semgrep, gitleaks ([.github/workflows/api-ci.yml](../../.github/workflows/api-ci.yml)).
