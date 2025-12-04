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
- [✓] Ensure **all non-auth routes** require authentication.
- [✓] Implement/verify permission checks:
  - [✓] Only post author or admin can edit/delete a post.
  - [✓] Only comment author or admin can delete a comment.
  - [✓] Only owner can remove family members.
- [✓] Add basic rate limiting to:
  - [✓] Signup
  - [✓] Login
  - [✓] Any high-write endpoints identified as hot spots in V1 (e.g., comments, “Cooked this”).

#### 1.2 Input Validation

- [✓] Introduce schema validation (Zod) at API boundaries.
- [✓] Validate inputs for:
  - [✓] Signup/login
  - [✓] Create/edit post (title required, enums valid, tags valid)
  - [✓] Comments
  - [✓] Reactions
  - [✓] "Cooked this!" events
  - [✓] Pagination/search query params
- [✓] Implement a **consistent error response format**
- [✓] Replace any "minimal validation" with concrete validation rules.
- [✓] Ensure API endpoints that are "happy-path only" now handle invalid input properly.

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

### Phase 0 - Repo Setup & Baseline Hygiene

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

### Phase 1.1 - Auth & Access Control

**Goal:** Harden authentication, authorization, and add rate limiting before deployment.

#### What Was Accomplished

1. **Password Security Verification**
   - Confirmed bcrypt implementation in `src/lib/auth.ts` with 10 salt rounds
   - Verified `hashPassword()` and `verifyPassword()` functions properly implemented
   - Family Master Key stored as bcrypt hash in database, verified in signup flow

2. **Authentication Middleware Infrastructure**
   - Created `src/lib/apiAuth.ts` with `withAuth()` and `withRole()` wrapper functions
   - Implemented `AuthenticatedUser` TypeScript interface for type safety
   - Refactored all 21 API routes to use consistent authentication pattern:
     - 2 auth routes (signup/login) remain unauthenticated
     - 19 protected routes converted to `withAuth()` pattern
   - Pattern guarantees authenticated user context in all handlers

3. **Permission System**
   - Created `src/lib/permissions.ts` with 5 centralized permission helpers:
     - `isOwnerOrAdmin()` - checks elevated privileges
     - `canEditPost()` - author or owner/admin can edit posts
     - `canDeletePost()` - author or owner/admin can delete posts
     - `canDeleteComment()` - author or owner/admin can delete comments
     - `canRemoveMember()` - only owner/admin, with additional constraints (cannot remove self or owner)
   - Integrated permission helpers into 5 routes:
     - `/api/posts/[postId]` (PUT/DELETE handlers)
     - `/api/comments/[commentId]` (DELETE handler)
     - `/api/family/members/[userId]` (DELETE handler)

4. **Rate Limiting Implementation**
   - Installed `lru-cache` 7.18.3 for in-memory rate limiting (Vercel-compatible, single-instance safe)
   - Created `src/lib/rateLimit.ts` with `RateLimiter` class supporting:
     - LRU cache with configurable size (500 entries per limiter)
     - TTL-based expiration
     - IP detection following DevSecOps best practices (X-Forwarded-For → X-Real-IP → request.ip)
     - Standard HTTP 429 responses with Retry-After header in seconds
   - Configured 6 pre-configured rate limiters:
     - **Signup:** 3 attempts per IP per hour
     - **Login:** 5 attempts per IP per 15 minutes
     - **Post Creation:** 10 per user per hour
     - **Comments:** 10 per user per minute
     - **"Cooked This" Events:** 10 per user per minute
     - **Reactions:** 30 per user per minute
   - Applied rate limiting to all critical write endpoints

5. **Code Organization & Patterns**
   - Established consistent route handler pattern:
     ```typescript
     export const METHOD = withAuth(async (request, user, context?) => {
       // Rate limiting if needed
       // Handler logic with permission helpers
     });
     ```
   - Used optional context parameters for dynamic routes with non-null assertions
   - Maintained TypeScript strict mode compliance (0 errors)
   - Made 4 incremental commits on feature branch following git flow

### Phase 1.2 - Input Validation

**Goal:** Implement comprehensive schema validation and consistent error handling across all API endpoints.

#### What Was Accomplished

1. **Standardized Error Response System**
   - Created `src/lib/apiErrors.ts` with consolidated error code enum:
     - `VALIDATION_ERROR` - Schema validation failures
     - `BAD_REQUEST` - General bad request errors
     - `UNAUTHORIZED` - Missing/invalid authentication
     - `INVALID_CREDENTIALS` - Failed login attempts
     - `FORBIDDEN` - Insufficient permissions
     - `NOT_FOUND` - Resource not found
     - `CONFLICT` - Duplicate resource conflicts
     - `RATE_LIMIT_EXCEEDED` - Rate limit violations
     - `INTERNAL_ERROR` - Unexpected server errors
   - Implemented 8 error helper functions returning consistent `NextResponse` objects
   - Defined `ApiErrorResponse` TypeScript interface: `{ error: { code, message } }`
   - All errors now use standard HTTP status codes with consistent JSON structure

2. **Comprehensive Validation Schemas**
   - Extended `src/lib/validation.ts` with Zod schemas for all API inputs:
     - **Pagination schema**: limit (1-100, default 20), offset (≥0, default 0) with `.coerce` for automatic type conversion
     - **Timeline/Comments/Cooked schemas**: Extend pagination for consistent query param handling
     - **Recipe filters schema**: Complex validation with 13 filter types:
       - Search query (max 200 chars)
       - Arrays: course, tags, difficulty, authorId, ingredients (with deduplication)
       - Number ranges: totalTime (0-720 min), servings (1-50) with cross-field validation (min≤max)
       - Sort option (recent/alpha)
     - **Route param schemas**: postId, commentId, userId all validated as CUID format
   - Preserved existing business rules: MAX_TIME_MINUTES=720, MAX_SERVINGS=50, INGREDIENT_LIMIT=5
   - Used `.transform()` for array deduplication and `.refine()` for cross-field validation

3. **Validation Helper Utilities**
   - Created 3 reusable helper functions in `apiErrors.ts`:
     - `parseQueryParams<T>()`: Handles URLSearchParams including arrays via repeated params (?key=val1&key=val2)
     - `parseRouteParams<T>()`: Validates dynamic route parameters with proper typing
     - `parseRequestBody<T>()`: Validates request bodies with schema enforcement
   - All helpers return discriminated union: `{ success: true, data: T } | { success: false, error: NextResponse }`
   - Enables clean early-return pattern: `if (!validation.success) return validation.error;`

4. **Route Validation Implementation**
   - Applied validation to 7 routes missing proper input validation:
     - `/api/timeline` - pagination query params
     - `/api/recipes` - replaced ~90 lines of manual parsing with single schema validation
     - `/api/family/members` - error helper adoption
     - `/api/me/favorites` - pagination validation
     - `/api/profile/posts` - pagination validation
     - `/api/profile/cooked` - pagination validation
     - `/api/auth/login` - request body validation with error helpers
   - Eliminated manual parsing code with bounds checking scattered across routes
   - Standardized error responses replacing 6+ different inline error formats

5. **Technical Decisions & Patterns**
   - Consolidated VALIDATION_ERROR and INVALID_INPUT into single code per requirements
   - Used REST-standard repeated parameters for arrays (not query string array notation)
   - Applied `.optional().default()` pattern with destructuring fallbacks for TypeScript type narrowing
   - Maintained strict rejection of invalid input (no lenient coercion beyond explicit `.coerce` for numbers)

6. **Complete Error Helper Refactoring (Task 5)**
   - Systematically refactored all 21 API routes to use standardized error helpers
   - Route groups refactored across 7 additional commits:
     - Auth routes (signup, login, logout) - 3 routes
     - Main posts route - 1 route
     - Reactions route - 1 route
     - Comments deletion route - 1 route
     - Profile routes (update, password) - 2 routes
     - Family member removal route - 1 route
     - Posts subroutes (favorite, cooked, comments) - 3 routes
   - Eliminated all inline error responses: `NextResponse.json({ error: { code, message }}, {status})`
   - Replaced with error helpers: `notFoundError()`, `forbiddenError()`, `validationError()`, etc.
   - Consolidated custom param schemas to centralized schemas from validation.ts

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

### Phase 1.1 - Auth & Access Control

**1. Middleware Abstractions Eliminate Repetitive Code**

- The `withAuth()` wrapper pattern eliminated 19 instances of duplicate authentication checks
- Before: every route had manual `getCurrentUser()` + null check + 401 response
- After: authentication guaranteed by type system, user context always available
- Side benefit: impossible to forget authentication on new routes when following established pattern
- Future refactors (like changing JWT implementation) now touch only 1 file instead of 21

**2. Centralized Permission Logic is Essential for Consistency**

- Permission helpers in `permissions.ts` created single source of truth for authorization rules
- Without helpers: permission logic scattered across routes, easy to miss edge cases or make inconsistent decisions
- With helpers: changing "who can delete a post" requires updating one function, not hunting through multiple files
- Detailed return types (with reason codes) enable better error messages without duplicating logic

**3. Rate Limiting Requires Careful Dependency Selection**

- Initial consideration of Redis for rate limiting would add infrastructure complexity for V1
- LRU cache solution: simpler, works in serverless, no external dependencies, good enough for single-instance deployment (like I plan to do via Vercel to start)
- Trade-off: resets on deploy, but acceptable for a 10 user (my family) app
- Future consideration: when scaling beyond single instance, Redis or similar would be necessary
- Key learning: "production-ready" doesn't have to mean "enterprise-scale ready"

**4. TypeScript Context Parameters in Next.js App Router Need Care**

- Dynamic route handlers receive context as second parameter after request
- With `withAuth()` wrapper, context becomes third parameter and may be undefined
- Solution: optional context type (`context?: { params: ... }`) with non-null assertion (`context!`) when needed
- Pattern: extract params at function start so they're in scope for error handlers
- Alternative considered: making context required, but that would break routes without params

**5. Incremental Commits Create Safety Net**

- Committing infrastructure separately from application (rate limiting → middleware → refactoring) made progress trackable
- Each commit was independently verifiable with `npm run type-check`
- When refactoring went wrong, could easily revert specific commit rather than losing all work
- Pre-commit hooks caught issues before they entered version control
- Lesson: even when working solo, commit discipline pays off

**6. IP-Based Rate Limiting Has Security Implications**

- Implemented best-practice IP detection: check `X-Forwarded-For` first (respecting proxies/load balancers)
- Behind proxy: all requests appear from proxy IP without header forwarding
- Must trust proxy headers (vulnerability if proxy not properly configured)
- For authentication endpoints: IP-based limiting appropriate (no user context yet)
- For authenticated endpoints: user ID-based limiting more accurate and fair
- Future consideration: combine both (rate limit per user AND per IP) for defense in depth

**7. Rate Limiting Windows Must Balance Security and UX**

- Too strict: legitimate users get blocked (e.g., 3 comments per minute would frustrate active users)
- Too loose: doesn't prevent abuse
- Solution: different limits for different risk levels:
  - Auth endpoints: very strict (3-5 attempts per window)
  - High-frequency actions (reactions): loose (30 per minute)
  - Moderate actions (comments, cooked events): balanced (10 per minute)
- Testing needed: these limits are educated guesses, may need tuning based on real family usage

**8. Pattern Consistency Accelerates Development**

- After establishing `withAuth()` pattern on first 3 routes, remaining 18 routes were mechanical
- Consistency meant: read existing route → identify auth check → apply pattern → verify with type-check
- Total refactoring time: ~2 hours for 21 routes
- Lesson: invest time in good patterns early, reap benefits in velocity later
- Contrast with ad-hoc approach: would be constantly making micro-decisions about how to structure each route

### Phase 1.2 - Input Validation

**1. Schema Validation Eliminates Entire Classes of Bugs**

- Before: manual parsing with `parseInt()`, bounds checking scattered across routes, inconsistent handling of missing/invalid values
- After: single source of truth in Zod schemas with automatic type coercion, bounds enforcement, and default values
- Recipes route example: replaced 90+ lines of manual parsing/validation logic with 6-line schema validation
- Side benefits: TypeScript gets proper types from schema inference, impossible to forget validation rules
- Future changes to validation rules now happen in one place (schema definition) rather than hunting through route handlers

**2. Discriminated Unions Create Ergonomic Error Handling**

- Validation helpers return `{ success: true, data } | { success: false, error }` pattern
- Enables clean early-return: `if (!validation.success) return validation.error;`
- TypeScript narrows types automatically - after success check, `validation.data` is fully typed
- Pattern eliminates need for try/catch around validation and provides consistent error responses
- Alternative considered: throwing errors from validators, but discriminated unions are more explicit and type-safe

**3. Zod's `.optional().default()` Has TypeScript Quirks**

- Expected: `.optional().default(value)` would infer type as `T`, not `T | undefined`
- Reality: Zod's type inference still marks it as potentially undefined
- Solution: destructuring with fallback defaults (`const { limit = 20 } = data`) for TypeScript narrowing
- This is a known Zod limitation - `.catch()` has similar issues
- Trade-off accepted: slight redundancy in destructuring vs. extensive type assertions everywhere

**4. REST Array Parameters vs. JSON Query Strings**

- Decision: use standard REST repeated params (`?course=breakfast&course=lunch`) over array notation (`?course[]=breakfast`)
- Rationale: more universal support, explicit in URL encoding, matches HTTP standards
- Implementation: `parseQueryParams()` detects multi-value keys via `URLSearchParams.getAll()`
- Alternative would have required custom parsing or URL manipulation
- Lesson: follow standards unless there's compelling reason to deviate

**5. Validation Schemas Should Encode Business Rules**

- Preserved existing constants (MAX_TIME_MINUTES, MAX_SERVINGS) as schema constraints
- Schemas now serve as living documentation of valid input ranges
- Cross-field validation (e.g., `minTime <= maxTime`) enforced at schema level with `.refine()`
- Business logic changes (e.g., "increase max servings to 100") now require schema update, making them explicit
- Future consideration: extract business rules to separate constants file that schemas reference

**6. Early Validation Enables Better Error Messages**

- Validating at API boundary means immediate, specific feedback to clients
- Before: vague errors after database queries or business logic execution
- After: precise errors like "Limit must be between 1 and 100" before any processing
- Side benefit: prevents invalid data from ever reaching business logic or database layer
- Improves security by rejecting malformed input before expensive operations

**7. Schema Inference Provides Free Documentation**

- TypeScript types generated from Zod schemas (e.g., `PaginationParams`, `RecipeFiltersParams`)
- These types can be exported and shared with frontend code for consistency
- Schema definitions are self-documenting - reading the schema shows all valid inputs and constraints
- Eliminates drift between validation rules and type definitions
- Future: could auto-generate OpenAPI/Swagger docs from Zod schemas

**8. Incremental Refactoring Reduces Risk**

- Approached validation in layers: error infrastructure → schemas → helpers → route application
- Each layer committed separately with type-check verification
- If validation broke a route, could pinpoint exact commit/change
- Contrast with "big bang" refactor: would have 200+ line uncommitted changes, hard to debug
- Pattern: build foundation tools first, then apply them systematically to existing code

**9. Manual Parsing Code is a Maintenance Burden**

- Recipes route had custom functions (`parseIntParam`, `normalizeRange`) used nowhere else
- Each route implemented slightly different parsing logic with different edge case handling
- Consolidating to schemas eliminated ~150 lines of duplicate parsing code across routes
- Lesson: spot repetition early and abstract into reusable patterns before it spreads
- Future vigilance: resist urge to write "quick" inline validation - always use schemas

**10. Error Response Consistency is User Experience**

- Found 6+ different inline error response formats before standardization
- Some had `message` only, some had `code`, inconsistent status code usage
- API clients now get predictable error structure: always `{ error: { code, message } }`
- Enables frontend to build generic error handling (e.g., map error codes to user-friendly messages)
- Lesson: establish error contract early before it proliferates across codebase

**11. Centralized Schemas Reduce Duplication**

- Found multiple routes defining custom param schemas (e.g., `postIdParamSchema` defined 3 times)
- Consolidated to single source in validation.ts, imported where needed
- Eliminates schema drift - changing CUID validation now happens in one place
- Side benefit: reduces line count and makes imports explicit about validation dependencies
- Lesson: as soon as you see a schema defined twice, extract it to shared validation file
