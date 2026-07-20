# Family Recipe

> A private family recipe sharing application – share what we're cooking, preserve recipes, and keep family's culinary traditions alive.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688.svg)](https://fastapi.tiangolo.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.11-2D3748.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## About

**Family Recipe** is a private web application designed for my family to:

- Share what they're cooking (quick posts or full recipes)
- Preserve recipes with structured details (ingredients, steps, times, difficulty)
- React and comment on posts
- Mark recipes as "Cooked this!" with ratings and notes
- Browse a family-wide timeline and recipe list
- Keep everything private within one family space

This app is intentionally **not** a public social network – it's a cozy, personal space for my family only.

### Key Features

- **Private Family Space** – Protected by a Family Master Key
- **Quick Posts & Full Recipes** – Share casually or in detail
- **Social Interactions** – Comments, emoji reactions, and "Cooked this!" events
- **Search & Filter** – Find recipes by title, author, tags, course, difficulty
- **Personal Lists** – Favorite recipes and track what users cooked
- **Mobile-First** – Designed for easy use on any device

---

## Architecture

The app runs as **three cooperating services that share one Postgres database**:

1. **Next.js app** ([`src/`](src/)) – App Router UI. It serves pages and a small set of same-origin routes under [`src/app/api/`](src/app/api/): auth proxies (`login`, `signup`, `logout`) that forward to FastAPI, a `bootstrap` route that mints the in-memory access token from the refresh cookie (and forwards FastAPI's rotated cookies), plus a `health` check. **It is no longer the data backend.**
2. **FastAPI service** ([`apps/api/`](apps/api/)) – **the sole application backend.** All post/recipe/comment/reaction/cooked/profile data and all authentication live here, served under a versioned `/v1/*` contract. In deployment the Next service reaches it via a same-origin `/v1` proxy (`API_INTERNAL_URL`).
3. **Recipe URL Importer** ([`apps/recipe-url-importer/`](apps/recipe-url-importer/)) – standalone Python service the FastAPI backend calls to parse recipes from a URL. It does not touch the database.

**Auth flow:** login/signup/logout POST to the Next proxy routes, which forward to FastAPI `/v1/auth/*`. FastAPI issues a short-lived in-memory **access token** and sets HTTP-only `refresh_token` + `csrf_token` cookies. The Next middleware ([`src/proxy.ts`](src/proxy.ts)) gates protected routes on the presence of the refresh-token cookie; SSR pages resolve the user through FastAPI `/v1/auth/session`.

> This is the state after the **Phase 4 FastAPI cutover** (issue #38). The Next `/api/*` data routes and the legacy Next JWT/`session`-cookie auth stack were deleted. For the full migration record and current architecture, see [`docs/API_BACKEND_MIGRATION_PLAN.md`](docs/API_BACKEND_MIGRATION_PLAN.md) and the root [`CLAUDE.md`](CLAUDE.md). To undo the cutover, see the [Phase 4 rollback runbook](docs/rollback-phase4.md).

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**

### 1. Clone the Repository

```
git clone https://github.com/wnorowskie/family-recipe.git
cd family-recipe
```

### 2. Install Dependencies

```
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file and configure it:

```
cp .env.example .env
```

Edit `.env` and update the values:

```
DATABASE_URL="postgresql://family_app:dev-only-password@localhost:5432/family_recipe_dev"
```

> **Note:** The Next service no longer signs its own sessions, so there is no `JWT_SECRET` here anymore — authentication is issued by the FastAPI backend. To exercise auth and app data locally you also need the FastAPI service running; see [`docs/verification/fastapi.md`](docs/verification/fastapi.md).

### 4. Set Up the Database

Local dev is Postgres-only (SQLite support was removed — see issue #80). Spin up a container once, then push the schema and seed:

```
docker run -d --name family-recipe-pg \
  -e POSTGRES_USER=family_app \
  -e POSTGRES_PASSWORD=dev-only-password \
  -e POSTGRES_DB=family_recipe_dev \
  -p 5432:5432 postgres:16

npm run db:generate
npm run db:push
npm run db:seed
```

> **Important:** After running `npm run db:seed`, the **Family Master Key** will be printed in the console. Save this key – it is needed to create an account!

### 5. Run the Development Server

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Running with Docker (Postgres)

To run the monolith + Postgres in containers:

1. Build and start:

```
docker compose up --build
```

- App: <http://localhost:3000>
- Postgres data persists in the `postgres-data` volume.
- Uploaded images persist via the bind mount `./public/uploads:/app/public/uploads`.
- Migrations run on container start via `prisma migrate deploy --schema prisma/schema.postgres.node.prisma` (JS client only; avoids the Python generator).
- Set `FAMILY_MASTER_KEY` (or `FAMILY_MASTER_KEY_HASH`) in your `.env` so docker-compose passes it through to the app.

2. Re-run migrations manually (if needed):

```
docker compose run --rm app npx prisma migrate deploy --schema prisma/schema.postgres.node.prisma
```

3. Seed data (optional):

```
docker compose exec app npm run db:seed
```

> Note: The containerized Next.js app uses the `prisma/schema.postgres.node.prisma` schema (JS client only). Use `prisma/schema.postgres.prisma` when you need the Python client (FastAPI service) and have the Python generator available.

### Local Development Options

- **Standalone Postgres container (default):** the docker command in step 4 is the canonical path. `npm run db:*` scripts target `prisma/schema.postgres.node.prisma` by default.
- **Full docker-compose stack:** use the section below (`Running with Docker`) when you want the Next app containerized too.

Pre-PR verification playbooks — including the Postgres setup — live in [`docs/verification/`](docs/verification/).

### Connecting to Cloud SQL (dev)

- Run Cloud SQL Auth Proxy:

```
cloud-sql-proxy family-recipe-dev:us-east1:family-recipe-dev --port 5432
```

- Set `DATABASE_URL` using the Secret Manager password:

```
DATABASE_URL="postgresql://family_app:DB_PASSWORD@127.0.0.1:5432/family_recipe_dev?sslmode=disable"
PRISMA_SCHEMA=prisma/schema.postgres.prisma
```

- Apply migrations and seed:

```
DATABASE_URL="postgresql://family_app:DB_PASSWORD@127.0.0.1:5432/family_recipe_dev?sslmode=disable" \
PRISMA_SCHEMA=prisma/schema.postgres.prisma \
npx prisma migrate deploy --schema prisma/schema.postgres.prisma

DATABASE_URL="postgresql://family_app:DB_PASSWORD@127.0.0.1:5432/family_recipe_dev?sslmode=disable" \
PRISMA_SCHEMA=prisma/schema.postgres.prisma \
FAMILY_NAME="Family Recipe" FAMILY_MASTER_KEY="actual-master-key" \
npm run db:seed
```

### Connecting to Cloud Run (dev)

- Ensure the Cloud Run service ingress is set to **All traffic (INGRESS_TRAFFIC_ALL)**. Without that setting, the proxy will respond with 404s even when the service is healthy.
- Start the Cloud Run proxy (requires `gcloud auth login` first):

```
gcloud run services proxy family-recipe-dev \
	--project family-recipe-dev \
	--region us-east1 \
	--port 9999
```

- With the proxy running you can hit the deployed app at <http://127.0.0.1:9999>. For quick verification, curl the health check:

```
curl -i http://127.0.0.1:9999/api/health
```

- Stop the proxy with `Ctrl+C` when you're done.

---

## Project Structure

```
family-recipe/
├── prisma/
│ ├── schema.postgres.node.prisma # Postgres schema (JS client — Next runtime)
│ ├── schema.postgres.prisma      # Postgres schema (Python client — FastAPI + migrations)
│ ├── seed.ts                     # Database seeding script
│ └── migrations/                 # Postgres migrations
├── src/
│ ├── app/
│ │ ├── (auth)/ # Authentication pages (signup, login)
│ │ ├── (app)/ # Protected app pages
│ │ │ ├── timeline/ # Family timeline feed
│ │ │ ├── recipes/ # Browse and search recipes
│ │ │ ├── add/ # Create new post/recipe
│ │ │ ├── posts/ # Post detail pages
│ │ │ ├── profile/ # User profile
│ │ │ └── family-members/ # Family admin
│ │ ├── api/ # Auth proxies to FastAPI + health check (no data routes)
│ │ ├── globals.css # Global styles
│ │ └── layout.tsx # Root layout
│ ├── components/ # React components
│ ├── lib/ # Utilities and helpers
│ │ ├── prisma.ts # Prisma client singleton
│ │ ├── session.ts # SSR user resolution via FastAPI /v1/auth/session
│ │ ├── uploads.ts # Photo storage (local FS or GCS)
│ │ ├── validation.ts # Zod schemas
│ │ └── ...
│ └── proxy.ts # Next.js middleware (auth gate)
├── apps/
│ ├── api/ # FastAPI service — the application backend (Python)
│ └── recipe-url-importer/ # Standalone recipe-from-URL parser (Python)
├── docs/ # Product and technical specs
├── figma/ # Figma design prototypes
├── public/ # Static assets
│ └── uploads/ # User-uploaded images
└── package.json
```

---

## Available Scripts

| Script                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | Start development server at `http://localhost:3000` |
| `npm run build`       | Build production bundle                             |
| `npm start`           | Start production server                             |
| `npm run lint`        | Run ESLint                                          |
| `npm run db:generate` | Generate Prisma client                              |
| `npm run db:push`     | Push schema changes to database                     |
| `npm run db:studio`   | Open Prisma Studio (database GUI)                   |
| `npm run db:seed`     | Seed database with initial data                     |

---

## Database Schema

The app uses **Prisma ORM** with PostgreSQL for both local development and production.

### Core Models

- **User** – Family members with authentication
- **FamilySpace** – The family group (single space in V1)
- **FamilyMembership** – Links users to family with roles (owner, member)
- **Post** – Quick posts or full recipes
- **RecipeDetails** – Optional structured recipe data
- **PostPhoto** – Images attached to posts
- **Comment** – Comments on posts
- **Reaction** – Emoji reactions on posts/comments
- **CookedEvent** – "Cooked this!" logs with ratings
- **Favorite** – User's bookmarked posts
- **Tag** – Recipe tags (e.g., "vegetarian", "quick")

See [`prisma/schema.postgres.node.prisma`](prisma/schema.postgres.node.prisma) for the complete schema.

---

## Authentication & Security

- **Password Storage:** Passwords are hashed using \`bcrypt\` (12 rounds)
- **Family Master Key:** Stored as a hash in the database, required for signup
- **Sessions:** Issued by the FastAPI backend — a short-lived in-memory access token plus HTTP-only `refresh_token` / `csrf_token` cookies. The legacy Next-signed JWT `session` cookie was removed in the Phase 4 cutover.
- **Validation:** All API inputs validated using Zod schemas (Next) and Pydantic (FastAPI)
- **Middleware:** Authentication required for all \`/app/\*\` routes

---

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [`PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) – Product requirements and UX flows
- [`TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md) – API design, data models, validation
- [`USER_STORIES.md`](docs/USER_STORIES.md) – User stories and acceptance criteria
- [`API_BACKEND_MIGRATION_PLAN.md`](docs/API_BACKEND_MIGRATION_PLAN.md) – FastAPI migration record and current backend architecture
- [`rollback-phase4.md`](docs/rollback-phase4.md) – How to roll back the FastAPI cutover
- [`V1_SUMMARY.md`](docs/V1_SUMMARY.md) – V1 implementation overview
- [`V2_PLAN.md`](docs/V2_PLAN.md) – Roadmap for production deployment

---

## Tech Stack

| Category         | Technology                                                   |
| ---------------- | ------------------------------------------------------------ |
| **Frontend**     | Next.js 16 (App Router), React 19                            |
| **Backend API**  | FastAPI (Python) — sole application/auth backend, `/v1/*`    |
| **Language**     | TypeScript (strict mode) · Python                            |
| **Database**     | Prisma + PostgreSQL (dev and prod)                           |
| **Auth**         | FastAPI-issued access token (JWT) + HTTP-only refresh cookie |
| **Styling**      | Tailwind CSS                                                 |
| **Validation**   | Zod (Next) · Pydantic (FastAPI)                              |
| **File Uploads** | Local filesystem (dev) · Google Cloud Storage (prod)         |

---

## Roadmap

### V1 (Current) – Local Development

- Signup/login with family master key
- Create posts (quick posts + full recipes)
- Comments, reactions, "Cooked this!" events
- Favorites and personal lists
- Timeline feed
- Recipe search and filtering

### V2 (In Progress) – Production Ready

- [ ] Dockerization
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Managed PostgreSQL database
- [ ] Security hardening (rate limiting, CSP headers)
- [ ] Comprehensive test suite
- [ ] Deployment to Vercel/Render
- [ ] Observability (logging, monitoring)

See [`FINAL_REPORT.md`](FINAL_REPORT.md) for detailed V2 implementation plan.

---

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database powered by [Prisma](https://www.prisma.io/)
- UI components inspired by [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

**Made with ❤️ for my family**
