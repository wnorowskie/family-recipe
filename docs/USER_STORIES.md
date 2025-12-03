# Family Recipe App – User Stories (V1 MVP)

This document captures the initial V1 user stories derived from `PRODUCT_SPEC.md`.  
All stories are written from the perspective of family members (end users) and the owner/admin (me).

---

## Epic 1: Accounts & Family Space

### US-1: Sign Up with Family Master Key

**As a** family member  
**I want** to create my own account and join our family space using a Family Master Key  
**So that** only people who know the key can join our private app

**Acceptance Criteria**

- Given I have the Family Master Key, when I sign up with my name, email/username, and password, then my account is created and linked to our family space.
- If I enter an incorrect Family Master Key, I am clearly informed that it is invalid and I am not added to the family.
- After successful signup, I am taken to the family timeline/home screen.

---

### US-2: Log In to My Account

**As a** family member  
**I want** to log into my existing account  
**So that** I can access my recipes, posts, and the family timeline

**Acceptance Criteria**

- I can log in using my chosen credentials (e.g., email/username + password).
- If I enter invalid credentials, I see a clear error message.
- After logging in, I land on the family timeline.

---

### US-3: View Family Members

**As a** family member  
**I want** to see who else is in our family space  
**So that** I know who can see and interact with my posts

**Acceptance Criteria**

- I can see a list of all members in the family space (name and avatar).
- The list clearly indicates who is the owner/admin.

---

### US-4: Manage Members (Admin Only)

**As the** owner/admin  
**I want** to view and manage family members  
**So that** I can keep our space private and remove access if needed

**Acceptance Criteria**

- I can see a list of all members and their status.
- I can remove (revoke access for) a member.
- Removing a member prevents them from accessing the app content going forward.

---

## Epic 2: Posts & Recipes

### US-5: Create a Quick Post (Title + Photo)

**As a** family member  
**I want** to quickly share what I cooked using just a title and optional photos  
**So that** posting is as easy as sending a picture in our group chat

**Acceptance Criteria**

- I can create a post with a required title and optional photos.
- No other fields are required to publish the post.
- The new post appears in the timeline and in my profile’s “My Posts.”

---

### US-6: Create a Full Recipe Post

**As a** family member  
**I want** to create a post with full recipe details  
**So that** others can follow and cook the dish

**Acceptance Criteria**

- When creating a post, I can optionally add:
  - Origin
  - Ingredients (multi-line list)
  - Steps/Instructions
  - Total time
  - Serving size
  - Course (Breakfast/Lunch/Dinner/Dessert/Snack)
  - Difficulty (Easy/Medium/Hard)
  - Tags (including dietary tags)
- If I fill in these fields, the post is treated as a “recipe” and shows a clearly separated recipe details section.
- Recipe posts require at least one ingredient and one step; if I don’t include both, the details are discarded and the post stays a quick share.
- The recipe is visible in both the timeline and recipe browsing/search.

---

### US-7: Edit My Recipe with a Change Note

**As a** recipe author  
**I want** to edit the recipe details and add a note explaining what changed  
**So that** the recipe can evolve while others know what was updated

**Acceptance Criteria**

- I can edit only the posts/recipes that I created (admin can edit any).
- Before saving changes, I can add an optional “change note.”
- The recipe shows:
  - Last edited timestamp
  - Last editor
  - The change note
- Other family members can still see the earlier comments and “Cooked this!” history even after edits.

---

### US-8: View a Post/Recipe

**As a** family member  
**I want** to view a post or recipe in a clean layout  
**So that** I can easily see the photos, details, and comments

**Acceptance Criteria**

- When I open a post, I can see:
  - Title
  - Author
  - Photos (with a main image and gallery if multiple)
  - Recipe details section if present
  - Tags
  - “Last updated” info if the recipe has been edited
  - Reactions
  - “Cooked this!” button
  - Comments list
- I can return to the timeline or recipe list easily.

---

## Epic 3: Family Timeline

### US-9: See the Family Timeline

**As a** family member  
**I want** to see a timeline of recent activity in our family space  
**So that** I can stay up-to-date on what everyone is cooking and posting

**Acceptance Criteria**

- The timeline is sorted by most recent activity first.
- The timeline includes:
  - New posts/recipes
  - New comments
  - “Cooked this!” check-ins
  - (Optionally) recipe edits with change notes
- Each timeline entry shows:
  - Who did the action
  - What they did
  - A short preview of the related post/recipe.

---

### US-10: See My Post Appear in the Timeline

**As a** family member  
**I want** newly created posts to appear in the timeline immediately  
**So that** everyone can see what I just shared

**Acceptance Criteria**

- After I publish a post, it appears at or near the top of the timeline.
- The entry shows my name and the post title and links to the post.

---

## Epic 4: Social Interactions (Comments, Reactions, Cooked This)

### US-11: Comment on a Post/Recipe

**As a** family member  
**I want** to leave comments on posts/recipes  
**So that** I can react, ask questions, or share feedback

**Acceptance Criteria**

- I can write and submit a text comment on any post/recipe.
- I can optionally attach a photo to my comment.
- My comment shows my name, text, and time posted.
- I can delete my own comments; admin can delete any comment.

---

### US-12: React with Emojis

**As a** family member  
**I want** to react to posts and comments using emojis  
**So that** I can respond quickly in a fun, lightweight way

**Acceptance Criteria**

- I can tap to add an emoji reaction (e.g., ❤️ 😋 👍 😂 🎉) to any post or comment.
- Multiple users can use the same reaction; the app shows a count and which users reacted.
- I can remove my reaction if I change my mind.

---

### US-13: “Cooked This!” with Rating and Note

**As a** family member  
**I want** to mark that I cooked a recipe, rate it, and leave an optional note  
**So that** I can track what I’ve tried and give feedback to the family

**Acceptance Criteria**

- On any post/recipe, I can tap “Cooked this!”.
- I can give a 1–5 star rating and optionally add a short note.
- A “Cooked this!” event is recorded and:
  - Appears in the timeline (“[User] cooked [Recipe] (X⭐)”).
  - Appears in my profile “Cooked” history.
- The recipe shows aggregate stats, such as:
  - Total times cooked
  - Average rating (if ratings exist).

---

## Epic 5: Browse & Search Recipes

### US-14: Browse All Recipes

**As a** family member  
**I want** to browse through all full recipe posts  
**So that** I can discover things to cook or be inspired

**Acceptance Criteria**

- I can access a dedicated “Recipes/Posts” browse view separate from the raw timeline that only lists posts containing Recipe Details.
- By default, items are sorted by most recently added.
- Each item shows:
  - Title
  - Author
  - Key tags and/or course
  - Thumbnail photo if available.
- Quick posts without Recipe Details remain timeline-only and are not searchable in this view.

---

### US-15: Filter by Course and Tags

**As a** family member  
**I want** to filter recipes by course and tags  
**So that** I can quickly find recipes that fit what I’m looking for

**Acceptance Criteria**

- I can filter recipes by:
  - Course (Breakfast, Lunch, Dinner, Dessert, Snack).
  - Tags (e.g., vegetarian, vegan, pescatarian, nut-free, dairy-free, gluten-free, mild, spicy, sweet, savory, american, italian, fusion, etc. from the curated catalog).
- Applying filters updates the list of results.
- I can clear filters to see all recipes again.

---

### US-16: Search by Title, Author, or Ingredient

**As a** family member  
**I want** to search for recipes by title, author, or ingredient  
**So that** I can find specific dishes or use what I have on hand

**Acceptance Criteria**

- I can type text into the search field to match recipe titles (case-insensitive).
- I can optionally limit results to a single family member via the author filter.
- I can add up to five ingredient keywords; recipes must contain each keyword in their ingredient list.
- Matching posts are displayed in the browse view.
- If there are no matches, I see a clear “No results found” message.

---

## Epic 6: Profile & Favorites

### US-17: View My Profile

**As a** family member  
**I want** to view my own profile  
**So that** I can see my posts, what I’ve cooked, and my favorites

**Acceptance Criteria**

- My profile shows:
  - My name and avatar.
  - Tab or sections for:
    - My Posts
    - Cooked (check-in history)
    - Favorites
- Each section shows a list of relevant posts/recipes.

---

### US-18: View My Posts

**As a** family member  
**I want** to see all the posts/recipes I’ve created  
**So that** I can review, edit, or cook them again

**Acceptance Criteria**

- “My Posts” shows all posts where I am the author.
- Each entry links to the full post/recipe.
- From this list, I can open a post and edit it (if I am the author).

---

### US-19: View My “Cooked” History

**As a** family member  
**I want** to see a history of recipes I have cooked  
**So that** I can remember what I’ve tried and how I felt about them

**Acceptance Criteria**

- The “Cooked” section in my profile shows:
  - Each “Cooked this!” entry with:
    - Recipe title
    - Date cooked
    - My rating
    - My note (if any)
- Each entry links to the full recipe.

---

### US-20: Save/Favorite a Post or Recipe

**As a** family member  
**I want** to save posts/recipes to my favorites  
**So that** I can quickly find them later

**Acceptance Criteria**

- I can mark any post/recipe as a favorite.
- Marking/unmarking updates instantly.
- Favorites are only visible to me (not other users).
- My “Favorites” section shows all posts/recipes I’ve saved and links to their details.

---

## Epic 7: Privacy & Security (Product-Level Behavior)

### US-21: Keep Family Content Private

**As a** family member  
**I want** our family’s recipes and posts to be private  
**So that** only our family can view and interact with the content

**Acceptance Criteria**

- There is no public or link-based sharing of content in V1.
- Only authenticated users who have joined with the correct Family Master Key can see any content.
- All posts, comments, reactions, and “Cooked this!” entries are only visible within our family space.

---

These user stories define the functional scope of the V1 MVP and align with the `PRODUCT_SPEC.md` document.
