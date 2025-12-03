# Family Recipe App – Technical Specification (V1 MVP)

This document translates the product and user stories into a concrete technical design for the V1 MVP of the **Family Recipe** app.

The goal is to keep the implementation **small, understandable, and easy to extend** while staying true to the product spec.

---

## 1. High-Level Architecture

### 1.1 Overall Approach

- **Client:** Mobile-first web application (SPA) built with a modern component-based framework.
- **Backend API:** JSON-based REST API.
- **Persistence:** Relational database (eventually a managed Postgres database).
- **Auth:** Email/username + password, session or token-based auth (JWT or HTTP-only cookies).
- **Deployment (flexible):**
  - Initial target is on monolithic application (eventually transformed into seperate backend / frontend services)
  - Designed for easy deployment to common platforms that I am familiar with (Vercel for frontend, Render or GCP for backend).

The app assumes **one Family Space** in V1, but the data model will be setup to support multiple families in the future.

---

## 2. Domain Model

### 2.1 Core Entities

#### User

Represents an individual family member.

- `id` (UUID / int)
- `name` (string)
- `email_or_username` (string, unique)
- `password_hash` (string)
- `avatar_url` (string, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

Constraints / behavior:

- Email/username must be unique.
- Passwords stored as secure hashes (e.g., bcrypt).

---

#### FamilySpace

Represents a family group. V1 will have a **single row**, but structure supports future multiple families.

- `id` (UUID / int)
- `name` (string) – e.g., `"Wnorowski Family"`
- `master_key_hash` (string) – hash of the Family Master Key
- `created_at` (timestamp)
- `updated_at` (timestamp)

Behavior:

- On signup, user provides the Family Master Key. Backend compares input (after hashing) to `master_key_hash`.
- V1: assume exactly one FamilySpace. Future-friendly: Users can be linked to multiple FamilySpaces via a join table.

---

#### FamilyMembership

Links a user to the family space with a role.

- `id` (UUID / int)
- `family_space_id` (FK → FamilySpace.id)
- `user_id` (FK → User.id)
- `role` (`'owner' | 'admin' | 'member'`)
  - V1: effectively `'owner'` for myself, `'member'` for everyone else. `'admin'` reserved for future.
- `created_at` (timestamp)

Constraints:

- Composite uniqueness: `(family_space_id, user_id)`.

---

#### Post

Represents both quick posts and full recipe posts.

- `id` (UUID / int)
- `family_space_id` (FK → FamilySpace.id)
- `author_id` (FK → User.id)
- `title` (string, required)
- `caption` (text, optional)
- `has_recipe_details` (boolean, default false)
- `main_photo_url` (string, optional – main cover image)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `last_edited_by` (FK → User.id, nullable)
- `last_edit_note` (text, nullable)
- `last_edit_at` (timestamp, nullable)

**Additional recipe details** are stored in a separate table (see below).  
This keeps quick posts lightweight and allows future non-recipe posts if desired.

---

#### PostPhoto

Stores additional photos attached to a post (beyond the main cover image).

- `id` (UUID / int)
- `post_id` (FK → Post.id)
- `url` (string)
- `sort_order` (int, default 0)
- `created_at` (timestamp)

---

#### RecipeDetails

Optional 1:1 record for posts that are recipes.

- `id` (UUID / int)
- `post_id` (FK → Post.id, unique)
- `origin` (string, nullable)
- `ingredients` (text) – multi-line freeform text
- `steps` (text) – multi-line / numbered text
- `total_time` (string) – e.g., `"45 min"`
- `servings` (string) – e.g., `"4 servings"`
- `course` (`'breakfast' | 'lunch' | 'dinner' | 'dessert' | 'snack' | 'other'`)
- `difficulty` (`'easy' | 'medium' | 'hard'`)
- `created_at` (timestamp)
- `updated_at` (timestamp)

---

#### Tag

Represents the curated tag catalog (diet preferences, allergen labels, spice levels, flavor notes, and cuisines). The list is seeded and managed centrally—no ad-hoc tags in V1.

- `id` (UUID / int)
- `name` (string, unique) – e.g., `"vegetarian"`, `"vegan"`, `"pescatarian"`, `"nut-free"`, `"dairy-free"`, `"gluten-free"`, `"mild"`, `"spicy"`, `"sweet"`, `"savory"`, `"american"`, `"italian"`, `"fusion"`, etc.
- `type` (string or enum, optional) – reflects the category (`diet preference`, `allergen-safe`, `heat`, `flavor notes`, `cuisine`, etc.)
- `created_at` (timestamp)

---

#### PostTag (many-to-many join)

Links tags to posts.

- `id` (UUID / int)
- `post_id` (FK → Post.id)
- `tag_id` (FK → Tag.id)

Constraints:

- `(post_id, tag_id)` unique.

---

#### Comment

Flat comments for posts.

- `id` (UUID / int)
- `post_id` (FK → Post.id)
- `author_id` (FK → User.id)
- `text` (text)
- `photo_url` (string, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp, nullable)

---

#### Reaction

Emoji-based reactions on posts and comments.

- `id` (UUID / int)
- `target_type` (`'post' | 'comment'`)
- `target_id` (FK → Post.id or Comment.id depending on `target_type`)
- `user_id` (FK → User.id)
- `emoji` (string) – e.g., `"❤️"`, `"😋"`

Constraints:

- One reaction per user per emoji per target:  
  unique `(target_type, target_id, user_id, emoji)`.

---

#### CookedEvent

Represents “Cooked this!” check-ins.

- `id` (UUID / int)
- `post_id` (FK → Post.id)
- `user_id` (FK → User.id)
- `rating` (int, nullable, 1–5)
- `note` (text, nullable)
- `created_at` (timestamp)

Aggregations such as **total times cooked** and **average rating** can be computed via queries or materialized/viewed later.

---

#### Favorite

User’s private favorites/bookmarks.

- `id` (UUID / int)
- `user_id` (FK → User.id)
- `post_id` (FK → Post.id)
- `created_at` (timestamp)

Constraints:

- Unique `(user_id, post_id)`.

---

## 3. API Design (REST)

Base URL: `/api/v1`

Authentication:

- All application endpoints (except signup/login) require authentication.
- Auth can be implemented via:
  - JWT in an HTTP-only cookie; or
  - Server-managed session with a session cookie.

Below is a functional outline; actual routing may vary by framework.

### 3.1 Auth

#### POST `/auth/signup`

**Body:**

- `name`
- `email_or_username`
- `password`
- `family_master_key`

**Behavior:**

- Validate `family_master_key` by hashing and comparing with stored `FamilySpace.master_key_hash`.
- Create `User` and `FamilyMembership` with role `'owner'` if this is the first user; otherwise role `'member'`.
- Start session / return auth token.

**Responses:**

- `201 Created` with user profile.
- `400 Bad Request` for invalid master key or validation errors.

---

#### POST `/auth/login`

**Body:**

- `email_or_username`
- `password`

**Responses:**

- `200 OK` with user profile and session/token.
- `401 Unauthorized` on invalid credentials.

---

#### POST `/auth/logout`

- Invalidates session / token.
- `204 No Content`.

---

#### GET `/auth/me`

- Returns current authenticated user profile and basic membership info (role, family_space_id).
- `401` if not authenticated.

---

### 3.2 Users & Family Members

#### GET `/family/members`

- Auth required.
- Returns list of users in the family space.

---

#### DELETE `/family/members/:userId` (Admin only)

- Removes a member’s access (delete `FamilyMembership` or mark as deactivated).
- Ensure users cannot remove the last remaining owner.
- Responses:
  - `204 No Content` on success.
  - `403 Forbidden` if non-admin.
  - `404 Not Found` if no such member.

---

### 3.3 Posts & Recipe Details

#### POST `/posts`

**Body (simplified):**

- `title` (required)
- `caption` (optional)
- `photos` (optional array of image URLs OR file uploads handled separately)
- `recipe` (optional object):
  - `origin`
  - `ingredients`
  - `steps`
  - `total_time`
  - `servings`
  - `course`
  - `difficulty`
  - `tags` (array of tag strings or IDs)

**Behavior:**

- Create `Post` row.
- If `photos` provided:
  - Set `main_photo_url` to first.
  - Create `PostPhoto` entries.
- If `recipe` provided:
  - Create `RecipeDetails` row.
  - Mark `has_recipe_details = true`.
  - Map tags to `Tag` / `PostTag`.
- Return the created post with recipe details.

---

#### GET `/posts/:postId`

- Returns full post:
  - Post
  - RecipeDetails (if any)
  - Photos
  - Tags
  - Summary stats (cooked count, avg rating)
  - Possibly a subset of comments (or all, depending on scale).

---

#### PUT `/posts/:postId`

**Auth rules:**

- Only post author or admin can edit.

**Body:**

- Same structure as `POST /posts`, with optional fields.
- Supports editing:
  - Title, caption, photos.
  - RecipeDetails fields.
  - Tags.
  - `last_edit_note` field.

**Behavior:**

- Update fields.
- Set:
  - `last_edited_by` = current user
  - `last_edit_note` (if provided)
  - `last_edit_at` = now

---

#### DELETE `/posts/:postId`

**Auth rules:**

- Only post author or admin.

**Behavior:**

- Hard delete (permanently removes post and all associated data).

---

### 3.4 Comments

- Create Comment with author = current user.

---

#### DELETE `/comments/:commentId`

**Rules:**

- Comment author or admin.

---

### 3.5 Reactions

#### POST `/reactions`

**Body:**

- `target_type` (`'post' | 'comment'`)
- `target_id`
- `emoji` (string)

**Behavior:**

- If a reaction with same `(target_type, target_id, user_id, emoji)` exists, toggle it off (delete).
- V1: implement toggle semantics (POST both adds and removes).

---

### 3.6 Cooked Events

#### POST `/posts/:postId/cooked`

**Body:**

- `rating` (1–5, optional)
- `note` (optional)

**Behavior:**

- Create `CookedEvent` with current user and timestamp.
- A user can cook the same recipe multiple times; no uniqueness constraint.

---

### 3.7 Favorites

#### POST `/posts/:postId/favorite`

- Creates a `Favorite` for current user if not exists.

#### DELETE `/posts/:postId/favorite`

- Removes `Favorite` for current user if exists.

#### GET `/me/favorites`

- Returns all favorited posts for current user.

---

### 3.8 Timeline

The timeline is a **derived view** from multiple sources:

- New `Post`
- New `Comment`
- New `CookedEvent`
- (Optionally) Post edits with change note

#### GET `/timeline`

Query params:

- `page`
- `limit`

**Behavior:**

- Returns a list of activity items sorted by time.
- Each item includes:
  - `type` (`'post_created' | 'comment_created' | 'cooked' | 'post_updated'`)
  - `actor` (user summary)
  - `post` (post summary)
  - Additional context (comment snippet, rating, change note)

**Implementation options:**

- Option A (simple): Build timeline on the fly using `UNION ALL` queries of posts, comments, cooked events, and edits, ordered by timestamp.
- Option B (future): Precompute `TimelineEvent` table as a write-through log for simpler queries.

V1 can use Option A for simplicity.

---

## 4. Validation & Business Rules

### 4.1 Signup

- All fields required for signup: name, email/username, password, family_master_key.
- Validate family_master_key against `FamilySpace.master_key_hash`.
- Enforce unique email/username.

---

### 4.2 Posts

- `title` required.
- No requirement for recipe fields.
- If recipe details are provided:
  - Persist them only when at least one ingredient and one step are provided; otherwise treat the submission as a quick post and ignore the partial metadata.
  - Validate `course`, `difficulty`, and tags are from allowed sets.

---

### 4.3 Comments

- `text` required.
- Max length (e.g. 1,000 characters) to avoid abuse.

---

### 4.4 “Cooked This!”

- `rating`, if provided, must be integer 1–5.
- Note length limited (e.g., 500–1,000 characters).

---

### 4.5 Permissions

- Only owners/admins can remove members.
- Only authenticated users can hit any app endpoint (except signup/login).
- Only post author or admin can:
  - Edit post
  - Delete post
- Only comment author or admin can delete comment.

---

## 5. Non-Functional Requirements

### 5.1 Performance & Scale

- V1 is a single-family app with small user count; performance constraints are modest.
- Key design decisions:
  - Use pagination and reasonable limits on `/timeline` and `/posts` (e.g., `limit <= 50`).
  - Indexes:
    - `posts.family_space_id, posts.created_at`
    - `comments.post_id, comments.created_at`
    - `cooked_events.post_id`
    - `tags.name`
    - `post_tags.post_id`, `post_tags.tag_id`

---

### 5.2 Security & Privacy

- All endpoints behind HTTPS.
- Passwords hashed with a strong algorithm (e.g., bcrypt, argon2).
- Family Master Key stored hashed, never in plaintext.
- Auth tokens/cookies must be secure/HTTP-only.
- No public or anonymous read endpoints in V1.

---

### 5.3 Logging & Error Handling

- Log:
  - Auth events (signup, login, logout).
  - Failed logins (without sensitive data).
  - API errors (500s, unexpected exceptions).
- Return structured error responses:
  - `{ "error": { "code": "SOME_CODE", "message": "Human-readable explanation" } }`

---

### 5.4 Future Extension Points

The design is intentionally generic enough to support:

- Multiple FamilySpaces (multi-tenant).
- Public recipe sharing, link-based sharing.
- OCR imports and URL imports.
- Mobile app clients hitting the same backend API.

---

## 6. Implementation Checklist (V1)

High-level dev checklist:

1. **Auth & User Management**
   - User model, FamilySpace, FamilyMembership
   - Signup, login, logout, `me` endpoints
   - Family Master Key verification

2. **Posts & Recipes**
   - Post, RecipeDetails, PostPhoto, Tag, PostTag models
   - CRUD for posts (create, read, update with change note, delete)
   - Recipe details attach/update logic

3. **Social Features**
   - Comments (create, list, delete)
   - Reactions (toggle)
   - CookedEvents (log, aggregate stats)
   - Favorites (save/remove, list)

4. **Timeline**
   - Derived / composed endpoint using Post, Comment, CookedEvent, (and edit timestamps if included)

5. **Profile Views**
   - Endpoints for:
     - User’s posts
     - User’s cooked history
     - User’s favorites

6. **Browse & Search**

- Recipes list endpoint that returns only posts with associated `RecipeDetails`. Quick posts without structured recipes are accessible via the timeline only and are excluded from browse/search.
- Supports title search plus filters (course, tags, author, ingredient keywords, difficulty, time, servings).

This spec should be enough to begin implementing the backend and wiring it to the front-end UI defined by `PRODUCT_SPEC.md` and `USER_STORIES.md`.
