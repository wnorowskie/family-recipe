# CSIS 690 Final Project - Eric Wnorowski

I will be looking to accomplish:

Option 1 - Implement a DevOps pipeline for an open source or personal project.

- Using the project described below (in much detail).
- The project does not have a DevOps pipeline (is not even a git repository yet).
- I will containerize parts of the application where appropriate.
- I will implement a build/lint/test/deploy pipeline in GitHub for the project.
- I will implement DevSecOps steps in the pipeline.

I will have a few major sections below:

1. **Project Background**
2. **Project Goals**
3. **Implementation Accomplished**
4. **Implementation Not Accomplished**
5. **Lessons Learned**

## Project Background

### Overview

I have created "Family Recipe" as a Christmas gift to my family. It is meant to be a private web application designed to make it easy for my family to share what we are cooking, preserve recipes, and give us a way to keep up to date on our latest dishes. It combines a simple social feed with structured recipe storage so that casual “look what I made tonight” posts and long-form recipes can live in the same space.

The app is not meant to be a public social network or a generic recipe site. It is intentionally scoped to work for only my family, creating a shared space that feels cozy, low-pressure, and personal.

---

### Origin of the Idea

Day-to-day, recipes and food photos in my family tend to be scattered across:

- Group texts with pictures of meals
- Screenshots of recipes
- Links that get lost in chat history
- Occasional handwritten or emailed recipes

This works in the moment but doesn’t build a long-term, searchable “family cookbook”, and it’s easy for good ideas to disappear. I wanted a way to:

- Preserve recipes we actually cook, in our own words
- Capture photos and reactions (“cooked this, it was great”)
- Keep everything private to my family, without ads or random people

Family Recipe grew out of that desire: a small, purpose-built app that feels more like a shared family journal than a public platform (but who knows where it will go!)

I started with an initial "V1" plan that was a bit "vibe codey" to be honest. It started with the product, going over the essential features that I wanted in the application. However it has since aligned well with out final project because I developed the V1 implementation to be a "local only" application - as I said before, purely focused on building out the essential product features.

As a result it has not followed the best (or any really) DevSecOps practices, as I just wanted to see if the idea is feasible. I have determined that it is indeed feasible to build out what I want to gift to my family and so now it's time to make it "production ready".

As we saw in our homework assignments with the wordguesser application, and talked about in the class discussion posts, reactionary DevSecOps can be difficult. So in order to curve some of that I will be looking to implement many of the concepts we have gone over throughout the semester in this application.

Essentially taking it from "V1" (a local app on my machine) to "V2" ( an enterprise level production grade application ).

To give context as to the work I have done on this application so far, below is a summary of where the application is at now I have created "V1 Summary" documentation that goes a bit more in depth on both the product and technical side of things.

I have also created a "V2 Plan" (that includes those class concepts) that I will be following in order to get this app to "production" AKA under the Christmas tree for my family.

---

### Product Concept (V1)

V1 focuses on a tight core of features:

- **Private family space**
  - One family “space” with a master key.
  - Each adult has their own account (admin (me) + members).

- **Timeline (Family Feed)**
  - A single family-wide feed of activity: new posts/recipes, comments, and “cooked this” check-ins.
  - Designed to replace the group text thread as the main place to share what we’re cooking.

- **Posts & Recipes**
  - A post can be:
    - A quick share: title + photo(s) + caption, or
    - A full recipe with ingredients, steps, time, servings, difficulty, course, and tags.
  - Only the original author (or admin) can edit, with optional change notes (e.g., “reduced garlic”).

- **Social Interactions**
  - Comments on posts (optionally with photos).
  - Emoji reactions on posts/comments.
  - “Cooked this!” events with optional rating and note.

- **Browse & Personal Lists**
  - Recipes tab with search and filters (title, author, tags, basic attributes).
  - Personal favorites list for each user.
  - Profile view with “My Posts”, “Cooked”, and “Favorites”.

V1 is deliberately narrow: there is no meal planning, grocery lists, OCR or URL import, or public sharing. The focus is a clean, pleasant experience for my family only.

---

## How V1 Has Been Built

V1 is implemented as a **modern full-stack web app**, with an emphasis on clarity, maintainability, and being easy to evolve:

- **Architecture**
  - A monolithic Next.js application using the App Router: frontend UI and JSON API live in the same codebase.
  - A relational database accessed through Prisma, with a schema aligned to the product spec (users, family space, posts, recipe details, comments, reactions, cooked events, favorites, tags, etc.).
  - Structured, versioned specs:
    - `PRODUCT_SPEC.md` – product behavior and UX.
    - `USER_STORIES.md` – user stories and acceptance criteria.
    - `TECHNICAL_SPEC.md` – domain model, API design, validation rules.

- **Development Approach**
  - I designed the initial app to be “product-first”: the core user experience, flows, and entities were defined before choosing specific implementations.
  - I used Figma to design a small set of mobile-first screens (auth, timeline, add post, post detail, cooked modal, recipes, profile, family members), which drive the component structure.

- **Current State**
  - Core features are implemented end-to-end: signup/login with family master key, post creation, recipe details, comments, reactions, cooked events, favorites, timeline, and profile views.
  - V1 is primarily “works on my machine” grade: suitable for local use and testing of the full product concept.
  - A separate V2 plan (`V2_PLAN.md`) outlines the path to a production-ready deployment, including Dockerization, managed database, CI/CD, testing, security hardening, splitting services, and more.

For more details on the implementation please reference `V1_SUMMARY.md` and `V1_DETAILED_SUMMARY.md` as well as the very detailed spec documents `PRODUCT_SPEC.md`, `TECHNICAL_SPEC.md`, and `USER_STORIES.md`.

---

### Goals Going Forward

The immediate goal is to take this V1 implementation and evolve it into a **production-ready, family-usable app**:

- Keep the product small and personal, focused on my family.
- Add DevSecOps practices (tests, scans, CI/CD, etc.) so it behaves like a “real” production system.
- Make deployment repeatable and maintainable, so the app can reliably work for years to come.

(more on this below)

---

## Project Goals

### Phase 0 - Repo Setup & Baseline Hygiene

**Goal:** Clean, understandable repo ready for DevSecOps work.

- [ ] Update:
  - [✓] `.gitignore` (node_modules, .next, local DB, `.env*`, etc.)
  - [✓] `.editorconfig`
  - [✓] `README.md` with:
    - [✓] Product overview
    - [✓] V1 basic feature summary
    - [✓] Local run instructions
  - [✓] `.env.example` with all required env variables (no real secrets)
- [✓] Create remote repo and push current code (GitHub).
- [✓] Create branches:
  - [✓] `main` → production
  - [✓] `develop` → active development
- [✓] Ensure ESLint + Prettier are configured for Next.js + TypeScript.
- [✓] Ensure strict TypeScript (`"strict": true`).
- [✓] Add pre-commit lint/format.

### Phase 1 – Security & Testing Foundations (Pre-Deploy)

**Goal:** Harden core app behavior and establish tests **before** any deployments.

Identify any **auth, validation, or error handling shortcuts** and make sure they’re explicitly addressed.

#### 1.1 Auth & Access Control

- [✓] Confirm password hashing uses a strong algorithm (bcrypt).
- [✓] Store the **Family Master Key** as a **hash** in the database.
- [ ] Ensure **all non-auth routes** require authentication.
- [ ] Implement/verify permission checks:
  - [ ] Only post author or admin can edit/delete a post.
  - [ ] Only comment author or admin can delete a comment.
  - [ ] Only owner can remove family members.
- [ ] Add basic rate limiting to:
  - [ ] Signup
  - [ ] Login
  - [ ] Any high-write endpoints identified as hot spots in V1 (e.g., comments, “Cooked this”).

#### 1.2 Input Validation

- [ ] Introduce schema validation (e.g., Zod) at API boundaries.
- [ ] Validate inputs for:
  - [ ] Signup/login
  - [ ] Create/edit post (title required, enums valid, tags valid)
  - [ ] Comments
  - [ ] Reactions
  - [ ] “Cooked this!” events
  - [ ] Pagination/search query params
- [ ] Implement a **consistent error response format**
- [ ] Replace any “minimal validation” with concrete validation rules.
- [ ] Ensure API endpoints that are “happy-path only” now handle invalid input properly.

#### 1.3 Testing

- [ ] Set up test framework (Jest).
- [ ] Set up code coverage tool (Istanbul).
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
  - [ ] Any other major feature flows.
- [ ] (If time allows) Add minimal **E2E tests** (Playwright) for:
  - [ ] Sign up and log in.
  - [ ] Create a post and see it in the timeline.
  - [ ] Mark “Cooked this” and see it reflected.

### Phase 2 – Local Environment Parity & Dockerization

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
- [ ] Address any local environment quirks (e.g., assumptions about file paths, local-only image storage) so they work inside containers.

### Phase 3 – External Database & Data Discipline

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
- [ ] Ensure any **schema changes** (e.g., additional indexes, enum refinements) are captured in migrations.
- [ ] Identify any data fields currently unused in V1 and decide whether to keep, remove, or fully wire them.

### Phase 4 – CI Pipeline (DevSecOps Core)

**Goal:** Every change is gated by tests, checks, and scans.

- [ ] Set up CI using GitHub Actions.
- [ ] CI workflow for PRs and pushes to `develop`/`main` should:
  - [ ] Checkout code.
  - [ ] Install dependencies.
  - [ ] Run **typecheck** (TS).
  - [ ] Run **lint**.
  - [ ] Run **tests** (unit + integration).
  - [ ] Run **build**.
  - [ ] Run **dependency scan** (e.g., `npm audit` or similar).
  - [ ] Run **secrets scan** (e.g., `gitleaks` / `detect-secrets`).
  - [ ] Run **SAST** (GitHub CodeQL, semgrep, etc.).
- [ ] Configure **branch protections**:
  - [ ] Require CI to pass before merging into `develop`.
  - [ ] Require CI to pass before merging into `main`.
  - [ ] Disallow direct pushes to `main` and `develop`.
- [ ] Add any additional checks that make sense given the current implementation (e.g., run Prisma migrations in CI using a temp DB to verify they apply cleanly).

### Phase 5 – First “Dev” Deploy of the Monolith

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
  - [ ] Dev URL is accessible.
  - [ ] Basic flows work (signup, login, create post, “Cooked this”, comments, favorites, profile, recipes browse/search).
- [ ] Verify any known limitations (e.g., image handling, search behavior) behave at least predictably in dev.

### Phase 6 – Security & Privacy Polish (If Time Allows)

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
- [ ] Address any specific security/privacy concerns (e.g., how long sessions last, how public URLs for images are handled).

### Phase 7 – Production Environment & Observability (If Time Allows)

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

### Phase 8 – Extract API (If Time Allows)

**Goal:** Prepare for a split architecture and Render/GCP move once v2 is stable.

- [ ] Plan extraction of API into a separate Node/TS or Python service:
  - [ ] Reuse Prisma models and API contracts defined in `TECHNICAL_SPEC.md`.
  - [ ] Match existing REST endpoints so the frontend doesn’t have to change much.
- [ ] Containerize API separately and:
  - [ ] Deploy to GCP Cloud Run or Render.
  - [ ] Hits managed Postgres instance.
- [ ] Add IaC (Terraform) for:
  - [ ] Cloud Run service.
  - [ ] Cloud SQL.
  - [ ] Networking and secrets.
- [ ] Update frontend to call the external API service instead of internal API routes.
- [ ] Remove frontend API routes in NextJs

---

## Implementation Accomplished

---

## Implementation Not Accomplished

---

## Implementation Accomplished

### Phase 0 - Repo Setup & Baseline Hygiene ✓

**Goal:** Clean, understandable repo ready for DevSecOps work.

#### What Was Accomplished

1. **Repository Foundation**
   - Enhanced `.gitignore` with comprehensive exclusions for Node.js, Next.js, IDE files, OS-specific files, databases, secrets, and uploads
   - Created `.editorconfig` to enforce consistent code style across editors (UTF-8, LF line endings, 2-space indentation, trim trailing whitespace)
   - Created `.env.example` documenting required environment variables (`DATABASE_URL`, `JWT_SECRET`) with security notes

2. **Code Quality Infrastructure**
   - Configured Prettier with React/Next.js industry standards (single quotes, semicolons, 80-char width, trailing commas ES5)
   - Extended ESLint configuration with `eslint-config-prettier` to avoid conflicts
   - Set up Husky + lint-staged for automated pre-commit hooks that:
     - Run TypeScript type-checking (`npm run type-check`)
     - Auto-fix ESLint issues on staged files
     - Auto-format code with Prettier
   - Added npm scripts: `lint:fix`, `format`, `format:check`, `type-check`, and `prepare`

3. **TypeScript Strict Mode Cleanup**
   - Fixed 18 TypeScript strict mode errors across 9 files:
     - **Variable scope issues (6 files):** Moved user/postId variable declarations outside try blocks so they're accessible in catch block error handlers
     - **JWT type safety:** Added runtime validation before type casting in `jwt.ts` to ensure payload properties exist and are correct types
     - **SQLite compatibility:** Removed `mode: 'insensitive'` from Prisma queries (SQLite doesn't support this PostgreSQL feature)
     - **Enum type assertions:** Fixed Set.has() calls with proper type casting for ingredient units and course values
     - **Ingredient parsing:** Rewrote `parseRecipeIngredients` to properly handle nullable quantity fields
   - Excluded `figma/` folder from TypeScript type-checking (prototyping code separate from production app)

4. **Professional Documentation**
   - Completely rewrote `README.md` with:
     - Project overview with badges (TypeScript, Next.js, Prisma, License)
     - Feature summary and project structure
     - Clear setup instructions (environment setup, database initialization, dev server)
     - Available scripts reference table
     - Tech stack documentation
     - V1/V2 roadmap

5. **Version Control & GitHub**
   - Initialized git repository
   - Created initial commit with clean baseline (163 files, 29,204 insertions)
   - Pushed to GitHub (`wnorowskie/family-recipe`)
   - Established branch strategy: `main` (protected, production) and `develop` (active development)

---

## Implementation Not Accomplished

---

## Lessons Learned

### Phase 0 - Repo Setup & Baseline Hygiene

**1. TypeScript Strict Mode Reveals Real Issues**

- Enabling strict mode uncovered actual bugs waiting to happen, particularly variable scope issues in error handlers where user context was being accessed but wasn't guaranteed to be in scope
- The discipline of fixing these errors before the first commit established a clean baseline for future CI/CD pipelines

**2. Database-Specific Features Need Abstraction Planning**

- SQLite vs PostgreSQL differences (like case-insensitive queries) surfaced early
- This highlighted the importance of testing against the target production database type, not just local development databases
- Future consideration: abstract database-specific query patterns into utility functions for easier migration

**3. DevSecOps Foundation Pays Dividends Immediately**

- Setting up pre-commit hooks before any "real work" prevents bad habits from forming
- Auto-formatting and linting on commit means code review can focus on logic, not style
- Type-checking as a git hook catches errors before they even reach CI

**4. Comprehensive .gitignore is Non-Negotiable**

- Taking time to properly configure `.gitignore` before first commit prevents secrets and sensitive data from ever entering version control
- Much easier to exclude patterns proactively than to scrub commit history reactively
- Validated that no databases, environment files, or upload directories were committed

**5. Documentation as Part of Foundation, Not Afterthought**

- Writing a professional README at the start (rather than "will document later")
- `.env.example` with comments serves as living documentation for required configuration

**6. Multi-File Replacements Require Precision**

- Using tools like `multi_replace_string_in_file` is efficient but demands exact string matching including all whitespace and formatting
- Better to read more context and match precisely than to make multiple attempts with approximate matches

**7. Separate Concerns Early (Figma Exclusion)**

- Excluding the Figma prototyping code from production type-checking was the right call
- Prototyping and design exploration code doesn't need the same rigor as production code
- Keeping them in the same repo is fine, but tooling should distinguish between them
