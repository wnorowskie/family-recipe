# Recipe URL Autofill Service Spec (v1)

**Service name:** `recipe-url-importer`  
**Runtime:** Python 3.12  
**Hosting:** Google Cloud Run (public web only)  
**Purpose:** Given a public recipe URL, fetch + parse the page and return a normalized `RecipeDraft` for your frontend to prefill the “Create Post / Add Recipe” experience.

---

## 1 Product Spec

### 1.1 Problem

Users copy recipes from random websites. Manually re-typing ingredients and steps is slow and discourages posting. We want a “paste URL → autofill recipe” workflow that works well for most public recipe pages.

### 1.2 Goals (v1)

- User pastes a URL and gets:
  - **title**
  - **ingredients** (raw strings)
  - **steps/instructions** (raw strings)
  - optional metadata: servings, times, image URL, author
- Good results for a broad set of public sites (blogs, common recipe sites).
- Fast enough for interactive UX.
- Safe by default (SSRF hardening, rate limiting, timeouts, max content size).
- Clear feedback: confidence score + warnings + missing fields.

### 1.3 Non-goals (v1)

- Paywalled/login-required content (NYT Cooking, etc.).
- Perfect unit parsing / structured ingredient normalization.
- Site-specific adapters for many domains (we can add later for top domains).
- Long-term storage of scraped HTML (keep minimal transient data).

### 1.4 UX Flow (frontend)

1. User pastes URL and clicks “Import”.
2. Frontend calls importer service.
3. Frontend populates editable fields:
   - Ingredients list (editable)
   - Steps list (editable)
   - Metadata if present
4. Frontend shows:
   - `Imported from <domain>`
   - “High/Medium/Low confidence”
   - Warnings (e.g., “Couldn’t confidently find instructions”)
5. If import fails, fallback CTA:
   - “Paste ingredients and steps manually”

### 1.5 Success Metrics

- ≥ 70% of import attempts return both ingredients + steps with **confidence ≥ 0.65**
- p95 response time:
  - **≤ 2.5s** for non-headless path
  - **≤ 8s** for headless fallback (if enabled)
- Low error rate (< 2% 5xx). Most failures should be 4xx with actionable messages.

---

## 2 Technical Spec

### 2.1 Architecture Overview

**Family Recipe App Frontend** → **Family Recipe API** (optional gateway) → **recipe-url-importer** (Cloud Run) → public internet websites

Recommended integration:

- Frontend calls your main API endpoint `POST /recipes/import` which forwards to importer (keeps keys/rate-limits centralized).
- Importer runs on Cloud Run with ingress restricted + authentication required; only the main API service account has invoker rights (OIDC).
- Direct frontend calls are a future option; would require JWT validation in the service (not planned for v1).

### 2.2 API Design

#### Endpoint: Parse Recipe from URL

`POST /v1/parse`

**Request**

```json
{
  "url": "https://example.com/recipes/best-chili",
  "options": {
    "prefer_language": "en",
    "include_debug": false
  }
}
```

**Response**

Includes `request_id` echoed back for support/correlation.

```json
{
  "request_id": "3f6c9e4b-1a2b-4f87-9c2a-0c1d2e3f4a5b",
  "recipe": {
    "title": "Best Chili",
    "ingredients": ["1 lb ground beef", "1 onion, diced"],
    "steps": [
      "Brown the beef in a large pot.",
      "Add onion and cook until translucent."
    ],
    "servings": "6",
    "prep_time_minutes": 15,
    "cook_time_minutes": 45,
    "total_time_minutes": 60,
    "image_url": "https://example.com/images/chili.jpg",
    "author": "Jane Doe",
    "source": {
      "url": "https://example.com/recipes/best-chili",
      "domain": "example.com",
      "strategy": "jsonld",
      "retrieved_at": "2025-12-23T17:10:22Z"
    }
  },
  "confidence": 0.92,
  "warnings": [],
  "missing_fields": []
}
```

**Low Confidence Response**

```json
{
  "request_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "recipe": {
    "title": "Chili Recipe",
    "ingredients": ["..."],
    "steps": []
  },
  "confidence": 0.42,
  "warnings": ["Could not confidently extract steps; please review."],
  "missing_fields": ["steps"]
}
```

**Error responses**

- 400 invalid URL / not allowed scheme / blocked host
- 408 upstream timeout
- 413 page too large
- 429 rate limited
- 502 upstream fetch failed (DNS, TLS, etc.)
- 500 unexpected parsing error (should be rare)

**Error codes (for frontend mapping)**

- `INVALID_URL` (400)
- `BLOCKED_HOST` (400)
- `FETCH_TIMEOUT` (408)
- `CONTENT_TOO_LARGE` (413)
- `RATE_LIMITED` (429)
- `ROBOTS_DISALLOWED` (451 reserved for future use)
- `UPSTREAM_FETCH_FAILED` (502)
- `PARSE_FAILED` (500)

**Warning codes (non-fatal)**

- `LOW_CONFIDENCE`
- `MISSING_INGREDIENTS`
- `MISSING_STEPS`
- `PAYWALL_OR_BLOCKED_SUSPECTED`
- `JS_RENDERING_REQUIRED_SUSPECTED`
- `NO_RECIPE_SCHEMA_FOUND`
- `HEURISTIC_EXTRACTION_USED`

**Health Endpoint**
GET `/healthz`

- 200 OK if service is healthy

**Version Endpoint**
GET /version → { "service": "recipe-url-importer", "version": "x.y.z", "git_sha": "..." }

### 2.3 Core Extraction Pipeline (Strategy Order)

#### Strategy A — Structured Data (highest priority)

1. Fetch HTML (non-headless)
2. Parse JSON-LD (`<script type="application/ld+json">`)
3. Find schema.org objects of type `Recipe` (including nested `@graph`)
4. Map fields:
   - `name` → title
   - `recipeIngredient` → ingredients (strings)
   - `recipeInstructions` → steps (string list)
   - `image`, `author`, `recipeYield`, `prepTime`/`cookTime`/`totalTime`

#### Strategy B — Microdata / RDFa (fallback)

- Extract microdata `itemtype="https://schema.org/Recipe"` where present
- Map similar fields

#### Strategy C — Heuristic HTML (fallback)

1. Use readability extraction to isolate main content
2. Identify "Ingredients" section:
   - Heading match: `ingredients`, `what you'll need`, etc.
   - List parsing (`ul`/`li`, `p` blocks)
3. Identify "Instructions" section:
   - Heading match: `instructions`, `directions`, `method`, `steps`
   - Ordered list (`ol`/`li`) or numbered paragraphs
4. Clean text:
   - Remove excessive whitespace
   - Normalize bullets
   - Drop empty lines

#### Strategy D — Headless Render (optional, controlled)

If A–C fail or confidence is low:

1. Render page using Playwright (Chromium)
2. Wait for `networkidle` (with max wait)
3. Extract rendered HTML
4. Re-run A–C
5. Gate with feature flag: `ENABLE_HEADLESS=false` by default; only enable for domains in `HEADLESS_ALLOWLIST_DOMAINS` (start empty). If disabled or domain not allowed, return partial + warning instead of headless fetch.

> **DevSecOps note:** Headless is expensive and increases attack surface; gate it with strict timeouts, size limits, and rate limits. You can enable it for v1 but treat it as a controlled fallback.

- **Implementation note:** Playwright binaries are not baked into the v1 image; `ENABLE_HEADLESS=true` is a no-op until Playwright is added in a later iteration.

#### Locale / Charset (v1)

- Assume UTF-8 pages; respect declared charset when provided.
- Heuristics are optimized for English headings/labels; no translation in v1.
- `prefer_language` option can be accepted but only used for future enhancements; no language-specific parsing beyond English now.

### 2.4 Confidence Scoring (v1)

Return a simple, explainable score.

**Example scoring model (0.0–1.0):**

| Category                 | Condition                                                           | Score                  |
| ------------------------ | ------------------------------------------------------------------- | ---------------------- |
| **Base by strategy**     | JSON-LD Recipe                                                      | +0.65                  |
|                          | Microdata                                                           | +0.55                  |
|                          | Heuristic                                                           | +0.35                  |
|                          | Headless + JSON-LD                                                  | +0.60                  |
|                          | Headless + Heuristic                                                | +0.40                  |
| **Completeness bonuses** | Has ≥3 ingredients                                                  | +0.10                  |
|                          | Has ≥2 steps                                                        | +0.10                  |
|                          | Has title                                                           | +0.05                  |
|                          | Has image/servings/times                                            | +0.02 each (cap +0.10) |
| **Penalties**            | Ingredients > 60 items (likely noise)                               | -0.10                  |
|                          | Steps > 50 items (likely noise)                                     | -0.10                  |
|                          | Extracted text contains "subscribe", "sign in", "enable javascript" | -0.15                  |

**Also return:**

- `missing_fields`: title, ingredients, steps, etc.
- `warnings`: short strings for UX messaging

### 2.5 Security & DevSecOps Requirements (v1)

#### SSRF Protections (mandatory)

Before fetching:

- Only allow `http` and `https`
- Resolve hostname and block:
  - Loopback (`127.0.0.0/8`, `::1`)
  - Link-local (`169.254.0.0/16`, `fe80::/10`)
  - Private RFC1918 (`10/8`, `172.16/12`, `192.168/16`)
  - Any internal DNS patterns you use
  - Explicit denylist: `localhost`, `metadata.google.internal`, `169.254.169.254`
  - Optional suffix block if used internally: `.local`, `.internal`, `.corp`
- Limit redirects:
  - Max redirects: 3
  - Re-validate SSRF rules on each redirect target
- Block non-standard ports (allow 80/443 only) unless you explicitly decide otherwise

#### Fetch Limits

- Total response size cap (e.g., 2–5 MB) for HTML
- Timeouts:
  - Connect timeout ~2s
  - Read timeout ~5s (non-headless)
  - Overall request budget ~8–10s (including headless)
- User-Agent: set a consistent UA string for politeness/diagnostics

#### Rate Limiting / Abuse Controls

- Require authentication:
  - V1: Cloud Run IAM with ingress restricted; only the main API service account can invoke.
  - Future (if direct frontend calls): validate user JWTs/API keys in-service (not enabled by default).
- Centralize user-level rate limiting in the main API; optionally add per-IP throttling here only if exposed directly.
- Main API suggested defaults: per-user ~10/min (small burst); optional per-IP ~30/min.
- Importer backstop (defense-in-depth, best-effort in-memory): per-IP ~20/min; per-domain ~60/min to avoid hammering a site. With IAM-restricted ingress this should rarely trigger.
- Optional domain-based throttling for repeated failures

#### Cloud Run / GCP Hardening

- Run as non-root in container
- Minimal base image, pinned versions
- Least-privilege service account:
  - Only needs logging/metrics
  - No access to sensitive internal resources
- Keep secrets out of code; use env vars + Secret Manager only if needed
- Consider egress controls:
  - If you use VPC connector, ensure it doesn't grant unintended access to internal services
- Vulnerability scanning in CI (SCA + image scan), fail build on criticals

#### Data Handling / Privacy

- Do not store full HTML by default
- Log only:
  - Domain
  - Strategy chosen
  - Timings
  - HTTP status codes
  - Confidence score
- Avoid logging full URLs with query params if they may contain tracking/user identifiers (sanitize)

#### Respectful Scraping

- For v1, skip `robots.txt` enforcement (single user-initiated fetch). Consider soft, warning-only checks later.
- Back off on 429/503 responses

### 2.6 Caching & Idempotency

Cache successful parse results by canonical URL hash:

- In-memory (per instance) for quick hits (v1 default)
- Consider shared cache (Redis / Memorystore) later if repeat URLs become common
- TTL: 7 days default

If the same URL is imported repeatedly, serve cached response quickly.

### 2.7 Observability

Use Cloud Logging + Cloud Monitoring with structured JSON logs and basic metrics.

#### Logs (structured JSON)

- `service` ("recipe-url-importer"), `version`
- `request_id` (UUID generated if absent), optional `correlation_id`
- `trace_id`/`span_id` (propagate `traceparent` if provided by main API)
- `domain`, `strategy`, `status` (success/partial/fail), `confidence`
- `timing_ms_total`, `timing_ms_fetch`, `timing_ms_parse`
- `headless_used` boolean
- `http_status_upstream`
- `warnings_count`, `missing_fields`

#### Metrics

- Request count by status
- Latency p50/p95/p99
- Headless fallback rate
- Top failing domains
- Upstream status code distribution

#### Tracing & Sampling

- Propagate `traceparent` from the main API when present; otherwise generate a `request_id` and include it in responses for support.
- No log sampling in v1; if cost pressure arises, sample successes only, never errors.

### 2.8 Implementation Plan (Python)

#### Suggested Libraries

| Purpose                      | Library                                               |
| ---------------------------- | ----------------------------------------------------- |
| HTTP fetching                | `httpx`                                               |
| HTML parsing                 | `selectolax` or `beautifulsoup4` (selectolax is fast) |
| JSON-LD parsing              | standard `json` + custom extraction logic             |
| Readability extraction       | `readability-lxml` (or similar)                       |
| Headless fallback (optional) | `playwright` (Python)                                 |

#### Module Layout

```
recipe_url_importer/
  app.py                 # FastAPI entry
  models.py              # Pydantic request/response models
  security/
    url_validation.py    # SSRF checks, redirect validation
  fetch/
    client.py            # httpx client, timeouts, max size
    headless.py          # playwright render (optional)
  parse/
    jsonld.py            # schema.org Recipe extraction
    microdata.py         # microdata recipe extraction (optional)
    heuristic.py         # headings/lists based extraction
    normalize.py         # map + clean into RecipeDraft
    confidence.py        # scoring + warnings
  cache/
    memory_cache.py      # simple TTL cache (v1)
  tests/
    test_jsonld.py
    test_ssrf.py
    fixtures/
```

#### FastAPI

- `POST /v1/parse`
- Use Pydantic models for strict response shape
- Add request middleware for `request_id` + timing

### 2.9 Testing Strategy

#### Unit Tests

- **JSON-LD parser handles:**
  - `@graph`
  - Arrays of entities
  - `recipeInstructions` as strings vs `HowToStep`
- **SSRF validation:**
  - Blocks private IPs, localhost, link-local
  - Blocks redirects to private ranges
- **Heuristic parser:**
  - Extracts from simple HTML fixtures

#### Integration Tests

- Use recorded HTML fixtures (stored in repo); do not hit live sites in CI.
- For manual/local smoke tests, keep a tiny allowlist of stable public URLs.
- Fixture set should cover: JSON-LD-heavy platforms, WordPress-style food blogs, print-recipe variants, long narrative pages (to validate readability), and a couple JS-rendered pages for headless evaluation.

### 2.10 Deployment Spec (Cloud Run)

#### Container

- Multi-stage build, slim runtime
- Run as non-root
- Health endpoint for readiness/liveness

#### Config

**Environment variables:**

- `MAX_HTML_BYTES` (e.g., `3_000_000`)
- `FETCH_TIMEOUT_SECONDS` (e.g., `8`)
- `ENABLE_HEADLESS` (`true`|`false`, default `false`)
- `HEADLESS_ALLOWLIST_DOMAINS` (comma-separated, default empty)
- `HEADLESS_MAX_RENDER_MS` (e.g., `6000`)
- `IMPORTER_STRATEGY_ORDER` (optional, e.g., `jsonld,microdata,heuristic,headless`)
- `CACHE_TTL_SECONDS` (e.g., `604800`)
- `RATE_LIMIT_*` (if enforced at app layer)
- Configured with `IMPORTER_` prefix in code (e.g., `IMPORTER_MAX_HTML_BYTES`).

Configured via Terraform `google_cloud_run_v2_service` container envs; no secrets needed for these toggles.

**Cloud Run settings:**

- Concurrency: start with 10–30 (tune later)
- CPU: 1
- Memory: 512MB–1GB (Playwright may need 1GB)
- Min instances: 0 (cost control)
- Max instances: set based on expected usage

#### Auth

- **Default (v1):** Only allow calls from your main API service using Cloud Run IAM (OIDC) with ingress restricted and invoker rights scoped to that service account.
- **Future option:** If exposing directly to frontend, add JWT validation (Authorization: Bearer `<user token>`) or API key handling. Do not enable by default.

---

## 3 Rollout Plan

### Phase 1 (MVP Import)

- JSON-LD extraction
- SSRF hardening + timeouts + size limits
- Heuristic fallback (readability + headings)
- Confidence scoring + warnings
- Cloud Run deploy + logging/metrics

### Phase 2 (Quality + Coverage)

- Microdata support
- Optional Playwright fallback behind a feature flag
- Caching improvements
- Domain failure analytics and targeted improvements

### Phase 3 (Nice-to-have)

- Ingredient parsing into structured fields (qty/unit/item)
- Site-specific adapters for top domains (only if needed)
- User feedback loop ("Was this import correct?")

---

## 4) Acceptance Criteria (v1)

- ✅ `POST /v1/parse` returns normalized `RecipeDraft` for common public recipe pages
- ✅ Returns confidence + warnings + missing_fields
- ✅ SSRF protections block private/internal addresses and redirects
- ✅ Enforced limits: timeout, max bytes, redirect limit
- ✅ Deployed to Cloud Run with least-privilege service account
- ✅ Structured logs and basic metrics available in GCP
- ✅ Unit + fixture-based integration tests passing in CI
