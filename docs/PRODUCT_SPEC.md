# Family Recipe App – V1 MVP Product Spec

## 1. Product Overview

A private app so that my family can:

- Share what they’re cooking (quick posts _or_ full recipes)
- Preserve recipes in a structured, searchable way
- React, comment, and check in when they cook something
- Browse a family-wide timeline of everyone’s cooking activity

**Audience for v1:** my family only (one “Family Space”).

**Primary jobs-to-be-done:**

1. Preserve family recipes going forward in one place.
2. Create a fun, lightweight social feed around cooking.

---

## 2. Users & Roles

### 2.1 User Types (v1)

- **Family Member**
  - Can create posts/recipes, comment, react, and use “Cooked this!”.
  - Has a personal favorites list.
- **Owner/Admin (Me)**
  - Everything a normal member can do, plus:
  - Manages membership list (can remove members; sharing the Family Master Key is how people join—no in-app invites/approvals in V1).
  - Can edit or delete any post/recipe and any comment.

### 2.2 Permissions (v1)

- **Create post/recipe:** All members.
- **Edit post/recipe:** Only original author + admin.
- **Delete post/recipe:** Author (their own) + admin (any).
- **Comment/react:** All members.
- **“Cooked this!” check-in:** All members.
- **View everything:** All members (single private family space).

### 2.3 Account Model & Family Join Flow

- Each person has their **own individual account** (e.g., email + password).
- All accounts belong to a single **Family Space**.
- Joining requires a **Family Master Key**:
  - During signup, user enters:
    - Their account credentials.
    - The **Family Master Key**.
  - If the key is correct, they join the family space.
  - I (admin) can see a list of members and remove them if needed. There is **no in-app invite or approval flow in V1**, membership is controlled through the Master Key to keep things simple.

---

## 3. Core Concepts & Data Model (Product View)

### 3.1 Family Space

- Exactly one space in v1: the family’s private space.
- Contains:
  - Members
  - Posts/Recipes
  - Comments, reactions, check-ins
  - Family-wide timeline (feed)

### 3.2 User Profile (Lightweight v1)

Each user has:

- Name / Display name.
- Avatar (optional).

Basic profile screen:

- Their posts/recipes.
- Their “Cooked this!” logs.
- Their favorites list.

### 3.3 Post vs Recipe

Everything is modeled as a **Post**, with **optional recipe details** so people can do quick shares or full recipes.

#### Post (core)

- **Required:**
  - Title (e.g., “Mom’s Lemon Chicken”, “Random Tuesday Pasta”)
  - Author (user)
- **Optional but encouraged:**
  - Photos (0 to many; most posts likely have 1+)
  - Description / caption (free text, e.g., “Tried a new sauce tonight!”)

#### Optional Recipe Details Block

If a post is a full recipe, it can include:

- Origin (e.g., “From Mom”, “Inspired by Smitten Kitchen”)
- Ingredients (structured list)
- Steps / Instructions (ordered list)
- Total time (single field; e.g., “45 minutes”)
- Serving size
- Course (e.g., Breakfast, Lunch, Dinner, Dessert, Snack)
- Difficulty (e.g., Easy / Medium / Hard)
- Tags (multi-select, including dietary tags)

> **Important:** A post is only treated (and stored) as a structured recipe if it includes at least one ingredient and one step. If either list is empty, the metadata is ignored and the post remains a “quick post.” This keeps recipes actionable for other cooks while still allowing lightweight timeline shares.

If a post has recipe details filled out (and meets the ingredient/step requirement), it behaves like a **Recipe Post**, but the model is unified.

### 3.4 Versioning (Recipe Edits)

For posts that contain recipe details:

- Edits are allowed only by:
  - The original author.
  - The admin.
- Each edit can include a **change note**:
  - e.g., “Reduced garlic from 6 cloves to 3 because it was overpowering.”
- The app stores:
  - Last edited timestamp.
  - Last editor.
  - Change note.

V1 UI:

- Show “Last updated by &lt;user&gt; on &lt;date&gt;: &lt;change note&gt;” on the recipe page.
- Full diff/history UI can be a later version; V1 only needs last change info.

### 3.5 Comments

- Flat (non-threaded) comments per post/recipe.
- Each comment:
  - Author
  - Text
  - Timestamp
- Comments can include **photos** (e.g., “I cooked this last night!” with a photo).
- Author of a comment can delete their own; admin can delete any.

### 3.6 Reactions

- Emoji-based reactions on posts and comments.
- V1: A small default set: ❤️ 😋 👍
- Show:
  - Count of each reaction.
  - Which users reacted (e.g., “❤️ by Eric”).

### 3.7 “Cooked This!” Check-in & Rating

On any post/recipe, a user can tap **“Cooked this!”**.

- Optional rating:
  - Simple 1–5 star rating.
  - Short note (e.g., “Turned out great, added extra lemon.”).
- Check-in events:
  - Show up in the timeline (“Eric cooked Mom’s Lemon Chicken”).
  - Appear in the user profile as part of “Cooked” history.
  - Aggregate on the recipe (e.g., “Cooked 5 times, avg rating 4.6”).

For V1:

- Use **simple 1–5 star rating + optional note**.

### 3.8 Favorites

- Each user can **favorite/save** any post.
- Favorites behave like personal bookmarks:
  - “My Favorites” list on their profile.
- Favoriting is private to that user and does not affect visibility.

---

## 4. Core User Flows

### 4.1 Sign Up & Join Family

1. User opens app → “Create Account”.
2. Enters:
   - Name
   - Email / username
   - Password
   - **Family Master Key**
3. If master key matches:
   - Account is created.
   - User is added to the Family Space.
4. On first login, they land on the **Family Timeline**.

### 4.2 Home / Timeline

**Timeline content (most recent first):**

- New posts/recipes created.
- New comments on posts.
- “Cooked this!” check-ins.
- (Optionally) edits to recipes (“Mom updated Lasagna recipe”).

Each feed item shows:

- Actor (e.g., Mom, Eric).
- Action (posted, commented, cooked, updated).
- Linked post/recipe preview (title + small photo if available).

### 4.3 Create a New Post/Recipe

1. User taps **“Add”** (or “+”).
2. Form:
   - Required:
     - Title
   - Optional:
     - Photo(s) upload
     - Caption / short description
     - Recipe details section (if they want to make it a full recipe):
       - Origin
       - Ingredients
       - Steps
       - Total time
       - Serving size
       - Course
       - Difficulty
       - Tags (including dietary tags)
3. User submits.
4. Post appears in:
   - Timeline (“Mom added a new recipe: Lemon Chicken”).
   - Recipe list/search.

> A post can be just a title + photo (no full recipe), so my family doesn't have to write out the full recipe if they don't want to.

### 4.4 View a Post/Recipe

Viewing a post:

- Shows:
  - Title
  - Author
  - Main photo + gallery if multiple.
  - Recipe details block (if present).
  - Tags.
  - “Last updated by &lt;user&gt; on &lt;date&gt;: &lt;change note&gt;” if applicable.
  - Reactions summary.
  - “Cooked this!” button.
  - Comments section.

### 4.5 Edit Recipe (with Version Note)

1. Author/admin opens their post.
2. Taps **“Edit”**.
3. Modifies recipe fields (ingredients, steps, etc.).
4. Enters **change note** (optional but encouraged).
5. Saves.
6. Post updates; version info and last edited metadata update.
7. Optionally, a lightweight activity item can be added to the timeline.

### 4.6 Comment & React

On any post:

- Scroll to comments.
- Type a comment, optionally attach a photo, then submit.
- Add emoji reactions by tapping an emoji icon.

Reaction summary shows on the post and on each comment.

### 4.7 “Cooked This!” Flow

1. User taps **“Cooked this!”** on a post.
2. Modal:
   - 1–5 stars.
   - Optional note.
3. Submit:
   - Timeline gets an entry: “Eric cooked Mom’s Lemon Chicken (4⭐)”.
   - Recipe shows aggregated stats (e.g., “Cooked 3 times, avg 4.3⭐”).
   - User’s profile shows the check-in.

### 4.8 Browse & Search

Dedicated **Recipes** section separate from the raw timeline:

- Scope: only posts that include full Recipe Details appear here. Quick posts without structured recipes live exclusively on the timeline and are not searchable.

- Filters:
  - Course (Breakfast/Lunch/Dinner/Dessert/Snack).
  - Tags (predefined set covering diet preferences, allergen flags, spice level, flavor notes, and cuisines).
- Search:
  - Primary search input matches recipe titles only (case-insensitive).
  - Author filter lets users pick a single family member to limit results.
  - Ingredient keyword filter accepts up to 5 keywords; recipe ingredients must contain each keyword.
- Sort:
  - Default: most recently added.
  - Optional: alphabetical by title.

### 4.9 Profile & Favorites

**My Profile**:

- User info.
- Tabs/lists:
  - **My Posts** (what they created).
  - **Cooked** (check-in history).
  - **Favorites** (recipes/posts they saved).

---

## 5. Tagging & Dietary Info

### 5.1 Course

- Breakfast
- Lunch
- Dinner
- Dessert
- Snack

### 5.2 Difficulty

- Easy
- Medium
- Hard

### 5.3 Tag Catalog (Curated)

Tags come from a fixed catalog that ships with the app (seeded in the database). Users pick from the available options; they cannot add ad-hoc/custom tags in V1. Categories include:

- **Diet preference:** vegetarian, vegan, pescatarian
- **Allergen-safe:** nut-free, dairy-free, gluten-free
- **Heat level:** mild, medium-spicy, spicy, extra-spicy
- **Flavor notes:** sweet, savory, tangy, smoky, herby, garlicky, umami, rich, fresh
- **Cuisine:** american, italian, mexican, mediterranean, greek, indian, chinese, japanese, thai, middle-eastern, latin-american, fusion

---

## 6. Privacy & Security (Product-Level)

- Everything lives inside **one private Family Space**.
- No public recipes.
- No link-based sharing outside the family in V1.
- Joining requires:
  - Knowing the Family Master Key.
  - Having an account.
- Admin can:
  - View current members.
  - Remove a member.

---

## 7. Non-Goals / Out of Scope for v1

Intentionally **not** in v1, but potential future features:

- Multiple families / spaces.
- Public or link-shareable recipes.
- OCR or photo-to-text for handwritten recipes.
- Importing recipes from URLs.
- Shared “collections” / cookbooks.
- Advanced filtering/analytics (e.g., “most cooked in last 30 days”).

---

## 8. UX Principles for v1

- **Mobile-first:** Most usage will be on phones.
- **Low friction to post:** Title + photo should feel as easy as sending a pic to the family group chat.
- **Friendly for non-technical family members:**
  - Simple, uncluttered create form.
  - Clear separation between “quick share” and “add full recipe details”.
- **Social first, utility second:**
  - Timeline front and center.
  - Reactions and comments easy to access.
- **Preservation mindset:**
  - Surface last edited info and change notes so recipes feel “living” but traceable.
