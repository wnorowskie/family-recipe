# V2 Plan – Making Family Recipe “Production-Ready”

This document is meant to be **living checklist** for turning the V1 implementation into a real, production-grade app that my family can actually use — with solid DevSecOps practices from the start.

I will use the checkboxes as I go.

This plan aligns with the **V1 Detailed Summary** that describes:

- What’s fully implemented
- What’s partially implemented
- Known shortcuts, limitations, and TODOs

Where relevant, the tasks below will cross‑check against that summary so V2 work is grounded in the actual current state.

---

## Pre-Phase – Align with V1 Detailed Summary

**Goal:** Make sure the V2 work is driven by the real state of V1, not assumptions.

- [ ] Read through the **V1 Detailed Summary** end-to-end.
- [ ] Create a short internal note (or section in this file) listing:
  - [ ] Features that are **fully implemented and stable**.
  - [ ] Features that are **implemented but with known shortcuts** (e.g., minimal validation, basic error handling).
  - [ ] Features that are **only partially implemented** or stubbed.
- [ ] For each shortcut / gap mentioned in the V1 summary (e.g., local-only image storage, missing rate limiting, minimal search, etc.):
  - [ ] Tag it to the relevant Phase below (Security, Testing, Dockerization, etc.).
  - [ ] Add a concrete bullet in that Phase if it’s not already covered.

---

## Phase 0 – Repo & Baseline Hygiene

**Goal:** Clean, understandable repo ready for automation.

- [ ] Create remote repo and push current code (GitHub).
- [ ] Create branches:
  - [ ] `main` → production
  - [ ] `develop` → active development
- [ ] Add/update:
  - [ ] `.gitignore` (node_modules, .next, local DB, `.env*`, etc.)
  - [ ] `.editorconfig`
  - [ ] `README.md` with:
    - [ ] Product overview
    - [ ] V1 basic feature summary (can be copied from the V1 Detailed Summary)
    - [ ] Local run instructions
  - [ ] `.env.example` with all required env variables (no secrets)

- [ ] Ensure ESLint + Prettier are configured for Next.js + TypeScript.
- [ ] Turn on strict TypeScript (`"strict": true`).
- [ ] (Optional) Add Husky + lint-staged for pre-commit lint/format.

---

## Phase 1 – Security & Testing Foundations (Pre-Deploy)

**Goal:** Harden core app behavior and establish tests **before** any dev/prod deploys.

Using the V1 Detailed Summary, identify any **auth, validation, or error handling shortcuts** and make sure they’re explicitly addressed.

### 1.1 Auth & Access Control

- [ ] Confirm password hashing uses a strong algorithm (bcrypt/argon2).
- [ ] Store the **Family Master Key** as a **hash** in the database.
- [ ] Ensure **all non-auth routes** require authentication.
- [ ] Implement/verify permission checks:
  - [ ] Only post author or admin can edit/delete a post.
  - [ ] Only comment author or admin can delete a comment.
  - [ ] Only owner can remove family members.
- [ ] Add basic rate limiting to:
  - [ ] Signup
  - [ ] Login
  - [ ] Any high-write endpoints identified as hot spots in V1 (e.g., comments, “Cooked this”).

### 1.2 Input Validation

- [ ] Introduce schema validation (e.g., Zod) at API boundaries.
- [ ] Validate inputs for:
  - [ ] Signup/login
  - [ ] Create/edit post (title required, enums valid, tags valid)
  - [ ] Comments
  - [ ] Reactions
  - [ ] “Cooked this!” events
  - [ ] Pagination/search query params
- [ ] Implement a **consistent error response format**, e.g.:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Title is required" } }
  ```

From V1 Detailed Summary:

- [ ] Replace any “minimal validation” with concrete validation rules.
- [ ] Ensure API endpoints mentioned as “happy-path only” now handle invalid input properly.

### 1.3 Testing

- [ ] Set up test framework (Jest).
- [ ] Set up code coverage tool.
- [ ] Write **unit tests** for:
  - [ ] Auth helpers (e.g., password hashing, master key verification).
  - [ ] Permission checks (“can this user edit/delete this resource?”).
  - [ ] Validation helpers/schemas.
- [ ] Write **API integration tests** for:
  - [ ] Signup with valid/invalid master key.
  - [ ] Login success/failure.
  - [ ] Create post (quick + full recipe).
  - [ ] Create comment.
  - [ ] Create “Cooked this!” event.
  - [ ] Favorite/unfavorite.
- [ ] (If time allows) Add minimal **E2E tests** (Playwright) for:
  - [ ] Sign up and log in.
  - [ ] Create a post and see it in the timeline.
  - [ ] Mark “Cooked this” and see it reflected.

From V1 Detailed Summary:

- [ ] Prioritize tests around features labeled as critical but fragile (e.g., timeline aggregation, tags, search) and any flows explicitly called out as “not heavily tested yet.”

---

## Phase 2 – Local Environment Parity & Dockerization

**Goal:** Make the app easy to run as a containerized monolith locally, ready for future splitting.

- [ ] Keep Next.js as a monolith (frontend + API) for now.
- [ ] Create a `Dockerfile` for the app:
  - [ ] Install dependencies.
  - [ ] Build the app.
  - [ ] Run `next start`.
- [ ] Add a `docker-compose.yml` with:
  - [ ] `app` service (Next.js container).
  - [ ] `db` service (Postgres official image).
  - [ ] Shared network and volume for Postgres data.
- [ ] Ensure migrations run in containers:
  - [ ] Command/steps to run `prisma migrate deploy` inside the app container.
- [ ] Verify local dev can run:
  - [ ] Directly via `npm run dev` (SQLite or local Postgres).
  - [ ] Via `docker-compose up` using Postgres.

From V1 Detailed Summary:

- [ ] Address any local environment quirks (e.g., assumptions about file paths, local-only image storage) so they work inside containers.

---

## Phase 3 – External Database & Data Discipline

**Goal:** Use a real managed Postgres instance with proper migrations and backups.

- [ ] Choose a managed Postgres provider for v2 (Supabase or GCP Cloud SQL).
- [ ] Create:
  - [ ] Dev database.
  - [ ] Prod database (can be empty for now).
- [ ] Configure `DATABASE_URL` values for:
  - [ ] Local dev
  - [ ] Dev environment
  - [ ] Prod environment
- [ ] Run Prisma migrations against the **dev database** (`prisma migrate deploy`).
- [ ] Add a **seed script**:
  - [ ] Create initial `FamilySpace`.
  - [ ] Store hashed family master key.
  - [ ] Create owner user or a way to bootstrap one.
- [ ] Enable **automatic backups** for the prod database with a reasonable retention period.

From V1 Detailed Summary:

- [ ] Ensure any **schema changes** (e.g., additional indexes, enum refinements) are captured in migrations.
- [ ] Note any data fields currently unused in V1 and decide whether to keep, remove, or fully wire them.

---

## Phase 4 – CI Pipeline (DevSecOps Core)

**Goal:** Every change is gated by tests, checks, and scans.

- [ ] Set up CI using GitHub Actions (or GitLab CI, etc.).
- [ ] CI workflow for PRs and pushes to `develop`/`main` should:
  - [ ] Checkout code.
  - [ ] Install dependencies.
  - [ ] Run **typecheck** (TS).
  - [ ] Run **lint**.
  - [ ] Run **tests** (unit + integration).
  - [ ] Run **build**.
  - [ ] Run **dependency scan** (e.g., `npm audit` or similar).
  - [ ] Run **secrets scan** (e.g., `gitleaks` / `detect-secrets`).
  - [ ] (Optional) Run **SAST** (GitHub CodeQL, semgrep, etc.).
- [ ] Configure **branch protections**:
  - [ ] Require CI to pass before merging into `develop`.
  - [ ] Require CI to pass before merging into `main`.
  - [ ] Disallow direct pushes to `main` and `develop`.

From V1 Detailed Summary:

- [ ] Add any additional checks that make sense given the current implementation (e.g., run Prisma migrations in CI using a temp DB to verify they apply cleanly).

---

## Phase 5 – First “Dev” Deploy of the Monolith

**Goal:** Deploy the app to a real dev environment with proper env vars and checks.

- [ ] Choose hosting platform for v2:
  - [ ] Vercel for the monolith Next.js app.
- [ ] Connect repo to hosting platform.
- [ ] Configure **dev environment**:
  - [ ] `DATABASE_URL` (dev DB).
  - [ ] Auth/crypto secrets (e.g., NextAuth secret, JWT secret).
  - [ ] Any other required env vars (master key hash if needed, etc.).
- [ ] Ensure deploys to dev are:
  - [ ] Triggered from `develop` (or PR branches).
  - [ ] Gated by CI passing.
- [ ] Confirm:
  - [ ] I can access the dev URL.
  - [ ] Basic flows work (signup, login, create post, “Cooked this”, comments, favorites, profile, recipes browse/search).

From V1 Detailed Summary:

- [ ] Prioritize manual testing of flows flagged as fragile or incomplete in the summary.
- [ ] Verify any known limitations (e.g., image handling, search behavior) behave at least predictably in dev.

---

## Phase 6 – Production Environment & Observability

**Goal:** Bring up a monitored, safe prod environment my family can actually use.

- [ ] Configure **prod environment** on hosting platform:
  - [ ] Point to prod `DATABASE_URL`.
  - [ ] Set all required secrets (auth, master key related, etc.).
- [ ] Set deployment rules:
  - [ ] Only deploy prod from `main`.
  - [ ] Deploy triggered via merges to `main` (or manual approval of a green build).
- [ ] Add **healthcheck** endpoint (e.g., `/api/health`) that:
  - [ ] Checks DB connectivity.
  - [ ] Returns simple status JSON.
- [ ] Set up monitoring:
  - [ ] Uptime monitor hitting prod URL and/or healthcheck.
  - [ ] Error monitoring (depends on deployment strategy) for frontend + backend.
- [ ] Verify logs are:
  - [ ] Structured enough to debug.
  - [ ] Not leaking sensitive data (passwords, master key, tokens).

From V1 Detailed Summary:

- [ ] Make sure any “surprising behaviors” noted in the summary (e.g., certain filters, edge cases) are known before inviting family and, if needed, documented as “known issues” for v2.

---

## Phase 7 – Security & Privacy Polish

**Goal:** Go from “works” to “thoughtful about security and privacy.”

- [ ] Ensure **all secrets** live only in:
  - [ ] Hosting platform env settings.
  - [ ] GitHub Secrets.
- [ ] Configure basic security headers:
  - [ ] Content-Security-Policy (CSP) (start with a simple one).
  - [ ] X-Frame-Options.
  - [ ] X-Content-Type-Options.
  - [ ] Referrer-Policy.
- [ ] Double-check logs:
  - [ ] No sensitive tokens.
  - [ ] No passwords or master key values.
- [ ] Confirm rate limiting is in place on critical endpoints.

From V1 Detailed Summary:

- [ ] Address any specific security/privacy concerns (e.g., how long sessions last, how public URLs for images are handled).

---

## Phase 8 – If Time Allows: Extract API / Move to GCP

**Goal:** Prepare for a split architecture and Render/GCP move once v2 is stable.

_(These are future steps, not required before first family-ready release.)_

- [ ] Plan extraction of API into a separate Node/TS or Python service:
  - [ ] Reuse Prisma models and API contracts defined in `TECHNICAL_SPEC.md`.
  - [ ] Match existing REST endpoints so the frontend doesn’t have to change much.
- [ ] Containerize API separately and:
  - [ ] Deploy to GCP Cloud Run or Render.
  - [ ] Use managed GCP Postgres (Cloud SQL).
- [ ] Add IaC (Terraform) for:
  - [ ] Cloud Run service.
  - [ ] Cloud SQL.
  - [ ] Networking and secrets.
- [ ] Update frontend to call the external API service instead of internal API routes.
- [ ] Update V1 and V2 summaries to reflect new architecture as it evolves.

---

This plan is intentionally thorough so the app feels like a **real, production-grade system**:

- Proper auth & validation
- Tests and scans in CI
- Container-ready
- Dev/prod environments
- Monitoring and security baked in

The V1 Detailed Summary is the “current state source of truth”.
