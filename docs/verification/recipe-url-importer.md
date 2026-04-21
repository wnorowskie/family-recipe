# Recipe URL importer verification

Run this when the change touches [apps/recipe-url-importer/](../../apps/recipe-url-importer/). Service context: [apps/recipe-url-importer/CLAUDE.md](../../apps/recipe-url-importer/CLAUDE.md). Behavior contract: [apps/recipe-url-importer/SPEC.md](../../apps/recipe-url-importer/SPEC.md) — **treat SPEC.md as the source of truth** for request/response shape, confidence scoring, SSRF rules, and error codes.

No DB, no auth (in local dev). The service fetches a public URL and returns a normalized `RecipeDraft`.

## Start the service

```bash
cd apps/recipe-url-importer
source .venv/bin/activate
PYTHONPATH=src uvicorn --app-dir src recipe_url_importer.app:app --reload --port 8000 &
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do sleep 0.5; done
```

If `.venv` doesn't exist:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

Note: the FastAPI service ([apps/api/](../../apps/api/)) also defaults to `:8000`. Don't run both at once, or pass `--port 8001` to one of them.

## L0 — parse a URL

The main endpoint is `POST /v1/parse`:

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"url":"https://www.example.com/recipe"}' \
  http://localhost:8000/v1/parse | jq .
```

Confirm the response matches the `RecipeDraft` shape in [SPEC.md](../../apps/recipe-url-importer/SPEC.md). Key fields to eyeball: `title`, `ingredients[]`, `steps[]`, `confidence`, `source`.

Try a few URL types:

| URL pattern                              | Expected                                          |
| ---------------------------------------- | ------------------------------------------------- |
| Site with JSON-LD recipe schema          | High `confidence`, clean ingredients/steps        |
| Site with microdata only                 | Medium confidence, may require heuristic fallback |
| Non-recipe URL (news article, blog post) | Low confidence or `RECIPE_NOT_FOUND`              |
| Malformed URL                            | `400` with a validation error                     |

## SSRF / safety probes

If the change touches fetch or URL validation, re-verify the SSRF guards in [apps/recipe-url-importer/src/recipe_url_importer/security/](../../apps/recipe-url-importer/src/recipe_url_importer/security/):

```bash
# Private IP — must be rejected
curl -s -H "Content-Type: application/json" \
  -d '{"url":"http://127.0.0.1:22/"}' \
  http://localhost:8000/v1/parse | jq .

# Loopback hostname
curl -s -H "Content-Type: application/json" \
  -d '{"url":"http://localhost/"}' \
  http://localhost:8000/v1/parse | jq .

# Non-HTTP scheme
curl -s -H "Content-Type: application/json" \
  -d '{"url":"file:///etc/passwd"}' \
  http://localhost:8000/v1/parse | jq .
```

All three should return a non-2xx with the appropriate error code per SPEC.md.

## Invariants to preserve

- [ ] No database imports — this service is stateless
- [ ] No auth imports (Cloud Run OIDC handles auth in prod — local dev skips it; the Next client in [src/lib/recipeImporter.ts](../../src/lib/recipeImporter.ts) signs requests when `IMPORTER_AUDIENCE` is set)
- [ ] `IMPORTER_MAX_HTML_BYTES` and timeout caps are respected on every fetch path
- [ ] SSRF guards run before any outbound request
- [ ] Response cache (in-memory) still keys by URL only

## Integration with the Next backend

If the change altered the response shape, update the client:

- [src/lib/recipeImporter.ts](../../src/lib/recipeImporter.ts) — request builder and response parser
- Any Zod schema in [src/lib/validation.ts](../../src/lib/validation.ts) that describes the draft

Then run the relevant Next route ([next-api.md](next-api.md)) that calls the importer (e.g. `POST /api/recipes/import`).

## Tests

```bash
cd apps/recipe-url-importer
source .venv/bin/activate
PYTHONPATH=src pytest -v
```

CI: [.github/workflows/recipe-url-importer-ci.yml](../../.github/workflows/recipe-url-importer-ci.yml).

## Before opening the PR

```bash
cd apps/recipe-url-importer
ruff check .
mypy src
PYTHONPATH=src pytest
```

Stop the service: `lsof -ti :8000 | xargs -r kill -9`.
