# CLAUDE.md — `apps/recipe-url-importer/`

Standalone Python service that fetches a public recipe URL and returns a normalized `RecipeDraft`. Setup and run commands live in [README.md](README.md). Behavior contract — request/response shape, confidence scoring, security requirements (SSRF, timeouts, max bytes), error codes — is in [SPEC.md](SPEC.md). **Treat SPEC.md as the source of truth** before changing parser, fetch, or response logic.

## Boundaries

- **No database access.** This service only reads URLs from the public internet. Don't import Prisma here; don't add DB-backed features.
- **Called by the Next backend**, not the browser directly. The client lives in [src/lib/recipeImporter.ts](../../src/lib/recipeImporter.ts). Authentication in production is via Cloud Run OIDC (only the main API service account is invoker).
- **Stateless aside from caching.** The optional response cache and per-IP / per-domain rate limits are in-process — fine for a single Cloud Run instance, would need redis if scaled.
- **Health endpoint is `/health`, not `/healthz`.** Google Frontend on `*.run.app` blackholes the exact lowercase path `/healthz` at the edge — the request never reaches the container, so the endpoint is unreachable regardless of what's registered in FastAPI. Any other casing/suffix passes through. See #113.

## Module layout

- [src/recipe_url_importer/app.py](src/recipe_url_importer/app.py) — FastAPI app + `POST /v1/parse`
- [src/recipe_url_importer/fetch/](src/recipe_url_importer/fetch/) — HTTP fetch with size/timeout caps and SSRF guards
- [src/recipe_url_importer/parse/](src/recipe_url_importer/parse/) — JSON-LD / microdata / heuristic recipe extraction
- [src/recipe_url_importer/security/](src/recipe_url_importer/security/) — URL validation, SSRF protection
- [src/recipe_url_importer/cache/](src/recipe_url_importer/cache/) — response cache keyed by URL
- [src/recipe_url_importer/rate_limit/](src/recipe_url_importer/rate_limit/) — IP + domain throttling
- [src/recipe_url_importer/config.py](src/recipe_url_importer/config.py) — `IMPORTER_*` env vars

## Tests

`PYTHONPATH=src pytest`. CI is [.github/workflows/recipe-url-importer-ci.yml](../../.github/workflows/recipe-url-importer-ci.yml).

## Verification

Before opening a PR that touches this service, run the [importer playbook](../../docs/verification/recipe-url-importer.md) — includes the `/v1/parse` loop, SSRF probes, and downstream-client check.
