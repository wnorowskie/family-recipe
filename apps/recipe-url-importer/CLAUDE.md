# CLAUDE.md — `apps/recipe-url-importer/`

Standalone Python service that fetches a public recipe URL and returns a normalized `RecipeDraft`. Setup and run commands live in [README.md](README.md). Behavior contract — request/response shape, confidence scoring, security requirements (SSRF, timeouts, max bytes), error codes — is in [SPEC.md](SPEC.md). **Treat SPEC.md as the source of truth** before changing parser, fetch, or response logic.

## Boundaries

- **No database access.** This service only reads URLs from the public internet. Don't import Prisma here; don't add DB-backed features.
- **Called by FastAPI**, not the browser and not Next. The client is [apps/api/src/recipe_importer.py](../api/src/recipe_importer.py), called from the recipes router. (`src/lib/recipeImporter.ts` still exists but its `importRecipeFromUrl` has no callers — only its `ImporterResponse` type is still used, by the add-post form.) Authentication in production is Cloud Run OIDC: only the main API service account is invoker.
- **Stateless aside from caching.** The optional response cache and per-IP / per-domain rate limits are in-process — fine for a single Cloud Run instance, would need redis if scaled.
- **Health endpoint is `/health`, not `/healthz`.** Google Frontend on `*.run.app` blackholes the exact lowercase path `/healthz` at the edge — the request never reaches the container, so the endpoint is unreachable regardless of what's registered in FastAPI. Any other casing/suffix passes through. See #113.

The one public route is `POST /v1/parse` in [src/recipe_url_importer/app.py](src/recipe_url_importer/app.py); the package layout under [src/recipe_url_importer/](src/recipe_url_importer/) is self-describing (`fetch/`, `parse/`, `security/`, `cache/`, `rate_limit/`), and env vars are `IMPORTER_*` in `config.py`.

## Tests

`PYTHONPATH=src pytest`. CI is [.github/workflows/recipe-url-importer-ci.yml](../../.github/workflows/recipe-url-importer-ci.yml).

## Verification

Before opening a PR that touches this service, run the [importer playbook](../../docs/verification/recipe-url-importer.md) — includes the `/v1/parse` loop, SSRF probes, and downstream-client check.
