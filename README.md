# Family Recipe

> A private family recipe sharing application – share what we're cooking, preserve recipes, and keep family's culinary traditions alive.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
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
DATABASE_URL="file:./dev.db"
JWT_SECRET="jwt-secret-placeholder"
```

> **Security Note:** Generate a strong random secret for production using:
>
> ```
> openssl rand -base64 32
> ```

### 4. Set Up the Database

```
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

1) Build and start:

```
docker compose up --build
```

- App: <http://localhost:3000>
- Postgres data persists in the `postgres-data` volume.
- Uploaded images persist via the bind mount `./public/uploads:/app/public/uploads`.
- Migrations run on container start via `prisma migrate deploy --schema prisma/schema.postgres.prisma`.

2) Re-run migrations manually (if needed):

```
docker compose run --rm app npx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

3) Seed data (optional):

```
docker compose exec app npm run db:seed
```

### Local Development Options

- **SQLite (default):** Use the `.env` defaults and `npm run dev`.
- **Local Postgres without Docker:** Set `DATABASE_URL` to your Postgres URL and `PRISMA_SCHEMA=prisma/schema.postgres.prisma`, then run:

```
npx prisma generate --schema prisma/schema.postgres.prisma
npx prisma db push --schema prisma/schema.postgres.prisma
npm run dev
```

Prisma migrations are generated for Postgres; stick to `prisma db push` for SQLite workflows.

---

## Project Structure

```
family-recipe/
├── prisma/
│ ├── schema.prisma # Database schema
│ ├── seed.ts # Database seeding script
│ └── migrations/ # Database migrations
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
│ │ ├── api/ # API routes (REST endpoints)
│ │ ├── globals.css # Global styles
│ │ └── layout.tsx # Root layout
│ ├── components/ # React components
│ ├── lib/ # Utilities and helpers
│ │ ├── prisma.ts # Prisma client singleton
│ │ ├── auth.ts # Password hashing
│ │ ├── session.ts # Session management
│ │ ├── validation.ts # Zod schemas
│ │ └── ...
│ └── middleware.ts # Next.js middleware (auth)
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

The app uses **Prisma ORM** with support for SQLite (local dev) and PostgreSQL (production).

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

See [`prisma/schema.prisma`](prisma/schema.prisma) for the complete schema.

---

## Authentication & Security

- **Password Storage:** Passwords are hashed using \`bcrypt\` (12 rounds)
- **Family Master Key:** Stored as a hash in the database, required for signup
- **Sessions:** JWT-based sessions stored in HTTP-only cookies
- **Validation:** All API inputs validated using Zod schemas
- **Middleware:** Authentication required for all \`/app/\*\` routes

---

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [`PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) – Product requirements and UX flows
- [`TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md) – API design, data models, validation
- [`USER_STORIES.md`](docs/USER_STORIES.md) – User stories and acceptance criteria
- [`V1_SUMMARY.md`](docs/V1_SUMMARY.md) – V1 implementation overview
- [`V2_PLAN.md`](docs/V2_PLAN.md) – Roadmap for production deployment

---

## Tech Stack

| Category         | Technology                                |
| ---------------- | ----------------------------------------- |
| **Framework**    | Next.js 14 (App Router)                   |
| **Language**     | TypeScript (strict mode)                  |
| **Database**     | Prisma + SQLite (dev) / PostgreSQL (prod) |
| **Auth**         | Credentials-based with JWT sessions       |
| **Styling**      | Tailwind CSS                              |
| **Validation**   | Zod                                       |
| **File Uploads** | Local filesystem (V1)                     |

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
