# Stack 0 — FastAPI Cookie & CORS Configuration Assessment

**Status:** Phase 1 source review (no live deploy yet — FastAPI not deployed to dev as of 2026-04-27)
**Issue:** [#36 — FastAPI migration Phase 2](https://github.com/wnorowskie/family-recipe/issues/36)
**Plan:** Stack 0 of `~/.claude/plans/claude-md-prepare-for-a-cached-fox.md`

## Purpose

Phase 2 wires the Next frontend onto the FastAPI token flow. The flow depends on three browser cookies set by FastAPI (`refresh_token`, `csrf_token`) being readable by the Next host:

- `refresh_token` (httpOnly) — sent automatically on `/v1/auth/refresh` and `/v1/auth/logout`.
- `csrf_token` (non-httpOnly) — read via `document.cookie` on the client and echoed as `X-CSRF-Token`.

If the FastAPI service runs on a different origin than the Next app, those cookies must either be cross-origin readable (requires `SameSite=None; Secure` and a `Domain=` covering both hosts) or the API must be reverse-proxied through Next so the browser sees a single origin.

## Phase 1 source: how cookies are configured

### [apps/api/src/cookies.py](../../apps/api/src/cookies.py)

`set_refresh_cookie` (lines 25–35):

```
httponly  = True
secure    = settings.is_production OR samesite == "none"
samesite  = settings.refresh_cookie_samesite     (default "lax")
domain    = settings.refresh_cookie_domain        (default None)
path      = "/"
```

`set_csrf_cookie` (lines 49–60) — same attributes except `httponly=False`.

`clear_*` (lines 38–46, 63–71) — must mirror the set attributes exactly or the browser refuses to delete the cookie.

### [apps/api/src/settings.py](../../apps/api/src/settings.py)

Configurable via env (lines 41–44):

- `refresh_cookie_name` — default `refresh_token`
- `csrf_cookie_name` — default `csrf_token`
- `refresh_cookie_domain` — default `None` (cookie scoped to the FastAPI host only)
- `refresh_cookie_samesite` — default `"lax"`

### [apps/api/src/main.py](../../apps/api/src/main.py)

CORS middleware (lines 32–36):

```
allow_origins      = settings.cors_origins_list   # parsed from CORS_ALLOW_ORIGINS env
allow_credentials  = True
allow_methods      = [GET, POST, PATCH, PUT, DELETE, OPTIONS]
allow_headers      = [Authorization, Content-Type, X-CSRF-Token, X-Request-Id]
```

`allow_credentials=True` is the right setting for the cookie + Bearer flow — the browser sends/receives cookies on cross-origin XHR only when the response includes `Access-Control-Allow-Credentials: true`.

## The three deployment shapes Phase 2 must work in

### 1. Local dev — `localhost:3000` (Next) + `localhost:8000` (FastAPI)

This is the only scenario that exists today.

**Browser cookie behavior:** different ports = different origins for CORS but the **same site** for cookie purposes (RFC 6265 — cookies are scoped by host, port is ignored). With default settings:

- `refresh_cookie_domain=None` → cookie scoped to host `localhost`, sent to BOTH ports.
- `samesite=lax` → sent on top-level GET navigations and same-site requests. Cross-origin POSTs (Next → FastAPI) are same-site (both `localhost`), so cookies attach.
- `secure=False` (because `is_production=False` and samesite≠"none") → fine for `http://localhost`.

**Verdict:** **Works as-is for local dev.** No env override needed.

**Required env to make Phase 2 work locally:**

```
# .env
CORS_ALLOW_ORIGINS=http://localhost:3000
```

(So FastAPI accepts cross-origin XHR from the Next dev server. Without this, browsers will block all `/v1/*` calls from the Next frontend.)

### 2. Dev Cloud Run — both services on `*.run.app` subdomains

When the FastAPI service is deployed to Cloud Run (per `apps/api/Dockerfile`), it gets a hostname like `family-recipe-api-dev-XYZ.us-central1.run.app`. The Next app gets a different `run.app` hostname.

**Browser cookie behavior:** different subdomains under `run.app`, but `run.app` is on the [Public Suffix List](https://publicsuffix.org/) — meaning a cookie set with `Domain=.run.app` is **rejected** by browsers (security — would let any Cloud Run service set cookies for any other). With `refresh_cookie_domain=None` (default), the cookie is scoped to the FastAPI host alone and the Next app cannot read it.

`SameSite=Lax` won't help either — cross-site XHR from Next to FastAPI won't include the cookie.

**Verdict:** **Default config does NOT work on raw `*.run.app` hostnames.** Two paths to fix:

- **(a) Custom domain** — front both services with a custom domain (e.g. `app.family-recipe.com` for Next, `api.family-recipe.com` for FastAPI). Cookies set with `Domain=family-recipe.com` are valid (apex is not on the PSL). Requires `samesite=none` + `secure=true` for cross-site XHR. Env:

```
REFRESH_COOKIE_DOMAIN=family-recipe.com
REFRESH_COOKIE_SAMESITE=none
CORS_ALLOW_ORIGINS=https://app.family-recipe.com
```

- **(b) Same-origin proxy** — route `/v1/*` from the Next host through a Next route handler or rewrite to the FastAPI Cloud Run service. The browser only ever sees the Next origin; FastAPI cookies go on the Next host. No cookie-domain config needed; CORS not in play. Trade-off: every API call hops Next → FastAPI server-to-server, doubling latency on the data plane.

This repo already has [docs/research/custom-domain.md](custom-domain.md) — relevant background for option (a).

### 3. Prod — same-origin or split-domain (TBD)

Same analysis as dev Cloud Run. Choice between (a) and (b) above is a deploy-architecture decision that needs to be made before Phase 4 (full cutover).

## What's missing for Stack 0 to be "passed"

Phase 2 implementation can proceed for **local dev** today using the default cookie config. But before any flag-on rollout to a deployed environment, the following must be settled:

1. **No FastAPI deploy workflow exists.** `apps/api/Dockerfile` builds, but there's no `deploy-api-dev.yml` workflow analogous to `deploy-dev.yml`. Phase 2's PR 2 (UX changes) cannot be flag-on tested in dev until the FastAPI service is actually running there.
2. **Choice between custom-domain and same-origin-proxy is unmade.** This is a multi-stakeholder infra decision (DNS, certs, Terraform), not a Phase 2 implementation detail. Phase 2 source code is agnostic to the choice — same client code works either way.
3. **`.env.example` is missing the FastAPI-side cookie/CORS knobs.** Add them so anyone running the local stack knows what to set.

## Recommendations

1. **Proceed with PR 1 (Stacks 1 + 2 — auth store, feature flag, refresh-and-retry).** Pure infra; no behavior change. Cookie-domain question is irrelevant for PR 1 because no FastAPI calls are made when the flag is off.
2. **Add a chore ticket** to:
   - Add `CORS_ALLOW_ORIGINS=http://localhost:3000` documentation to `.env.example` for local dev.
   - Document `REFRESH_COOKIE_DOMAIN` and `REFRESH_COOKIE_SAMESITE` in the FastAPI README's "Notes" section.
3. **Open a separate ticket for FastAPI dev deployment + domain decision.** This is the prerequisite for PR 2 being tested in flag-on mode against dev. PR 2 source code can be written and reviewed before that ticket lands; the gate is on flag-on E2E, not on merging the code path.
4. **For PR 2 implementation work**, default to running locally (`docker compose up fastapi` + `npm run dev`) with `NEXT_PUBLIC_USE_FASTAPI_AUTH=true` and `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`. The `localhost`-shared-host cookie behavior covers all of Phase 2's flag-on logic.

## Conclusion

**Stack 0 verdict:** **PASS for local-dev usage; conditional pass for deployed environments.**

- Local dev with default settings + `CORS_ALLOW_ORIGINS=http://localhost:3000` works.
- Deployed dev/prod requires a same-origin proxy or custom-domain decision before flag-on rollout.
- Phase 2 frontend code (PR 1 + PR 2) is agnostic to the deploy decision and can be implemented now. The deploy decision is a separate ticket and is **not** a blocker for Phase 2 implementation, only for Phase 2 production rollout.

Phase 2 is unblocked. Proceed to PR 1 — Stack 1 (auth store + feature flag).
