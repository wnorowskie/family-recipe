# Family Recipe — Design System

A private, family-only web app for sharing recipes and cooking moments — quick posts, full recipes, photos, comments, reactions, and "Cooked this!" events. Built mobile-first as a Next.js 14 + Tailwind app.

> **Made with ❤️ for one family** — not a public social network. The vibe is a cozy shared kitchen notebook, not a feed to perform on.

---

## ⚠️ Important note on visual direction

The original brief described **warm neutral surfaces — soft off-whites, gentle browns, muted greens** (NYT Cooking / Goodreads inspired). The actual Figma wireframe export and shipped codebase use a **cool, neutral grayscale** palette — soft gray-50 surfaces, gray-200 borders, near-black `gray-800` primary buttons, white cards. There is no warm brown or muted green anywhere in the source.

This design system is built **from the source of truth (the Figma + codebase)**, so it is grayscale-neutral. If you want the warm cozy palette from the brief, that is a future direction we can layer on — see "Open questions" below.

---

## Sources

| Source            | Path / link                                                                                                            | What's there                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Codebase**      | `github.com/wnorowskie/family-recipe`                                                                                  | Next.js 14 App Router, TS, Tailwind, Prisma, shadcn-style UI. Routes under `src/app/(app)/*` and `src/app/(auth)/*`.                   |
| **Figma project** | [Family Recipe Mobile Wireframes](https://www.figma.com/design/aX3Fc8saSTp16h7QxJS1n3/Family-Recipe-Mobile-Wireframes) | Original mobile wireframes.                                                                                                            |
| **Figma export**  | `figma/src/components/*` in repo                                                                                       | Code export of every wireframe screen + the full shadcn/ui component library. **The primary visual reference for this design system.** |
| **Product spec**  | `docs/PRODUCT_SPEC.md`, `docs/USER_STORIES.md`                                                                         | Feature flows, copy patterns, user goals.                                                                                              |
| **Tech stack**    | `package.json`, `tailwind.config.js`                                                                                   | Tailwind v4 with CSS `@theme` tokens.                                                                                                  |

---

## What this app does (so you design for the right job)

**One private family space.** Users sign up with a shared "Family Master Key" the owner gives them. Inside, four tabs:

1. **Timeline** — chronological feed of family activity. New posts, comments, "Cooked this!" events. Each entry is a small card with a line icon (FileText / MessageCircle / ChefHat) on the left and a one-sentence headline like _"Mom posted 'Lemon Chicken'"_.
2. **Recipes** — searchable list of every recipe the family has saved. Filter by course / tags, sort by newest. List rows: thumbnail + title + author + 1–2 tag chips + "Cooked 3 times · 4.3⭐".
3. **Add (+)** — a center FAB on the bottom tab bar. Opens a "New Post" form: photos, title, caption, and an optional collapsible "Recipe Details" section (origin, ingredients, steps, time, serves, course, difficulty, tags).
4. **Profile** — own avatar + 3 stats (Posts / Cooked / Favorites), three tabs (My Posts / Cooked / Favorites), and Family Members + Log Out at the bottom.

Mobile-first; the design width is **375px** with a 4px-bordered, 40px-rounded "device frame" in the wireframes.

---

## Index

- `README.md` — this file
- `colors_and_type.css` — design tokens (CSS custom properties) for color, type, spacing, radii, shadows
- `fonts/` — typeface files (currently relies on system stack — see Type section)
- `assets/` — logos, imagery, sample illustrations
- `assets/icons/` — Lucide icon strategy (CDN-linked; see ICONOGRAPHY)
- `preview/` — small HTML cards that populate the Design System review tab
- `ui_kits/family-recipe-app/` — high-fidelity React recreations of each core screen + components, with an interactive `index.html` (5 frames: login, timeline, recipe detail, browse, profile)
- `SKILL.md` — Agent Skill manifest for re-use as a Claude Code skill

---

## CONTENT FUNDAMENTALS

The voice is **a family group chat, not a brand**. Short, plain, warm. No marketing prose, no exclamation points used to manufacture excitement, no "we" — but plenty of first names.

### Voice & tone

- **Casual, second-person, low-stakes.** _"Share what we're cooking."_ _"Ask the owner for this code."_ _"Add a comment…"_
- **Family terms over user terms.** People are referred to by **family names** in product copy and seed data — _Mom, Dad, Eric, Sarah, Tom_ — not "@user42" or "Member 1." This is the most distinctive copy choice in the product.
- **Activity sentences read naturally.** Timeline entries are written as full sentences with the title in single quotes: _"Mom posted 'Lemon Chicken'"_, _"Eric commented on 'Lemon Chicken'"_, _"Eric cooked 'Lemon Chicken'"_. The verb is past tense, lowercase.
- **No marketing voice.** No "Discover delicious recipes from your loved ones!" Real example from the repo README: _"A private family recipe sharing application — share what we're cooking, preserve recipes, and keep family's culinary traditions alive."_
- **Kindness over precision.** _"This was amazing! The lemon flavor was perfect."_ is shipped sample copy. Comments sound like a kitchen conversation.

### Casing

- **Sentence case everywhere.** Headings, buttons, labels, tabs, tags. _"My Posts"_, _"Family Members"_, _"Add Recipe Details (Optional)"_, _"Cooked this"_. No Title Case On Marketing Headers.
- **Tags are lowercase** (`quick`, `family classic`, `kid-friendly`, `comfort food`) — they read like the way a person would write them in their own notes.
- **Course/difficulty values are capitalized** (`Dinner`, `Easy`) because they're a fixed enum, not free-form tags.

### Pronouns and authorship

- **"My"** for personal collections — _"My Profile"_, _"My Posts"_, _"My recipes"_.
- **"by Mom"**, **"by Dad"** for attribution — never "Author: Mom" or "Created by".
- **No "I" in product UI.** Reactions and "Cooked this" are written from the system's perspective: _"Eric cooked 'Lemon Chicken'"_ — the user is named, not "you".

### Emoji usage

Emoji **does** appear — but only in two narrow places:

1. **As reaction tokens** — ❤️, 😋, 👍, ⭐ on posts and "Cooked this" ratings. These are user-generated content (reactions), not chrome.
2. **As one decorative accent** — the 🍳 logomark on the auth screens (currently a placeholder for a real wordmark).

**Emoji is _not_ used for navigation, buttons, section headers, or status.** Those use Lucide line icons. This is intentional and important: it keeps the chrome quiet and the UGC expressive.

### Microcopy patterns

| Pattern                                     | Example                                                                                          | Why                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Empty placeholder asks for content directly | _"Recipe or post title"_, _"Add a comment…"_, _"Share the story behind this dish…"_              | Friendly, instructive, not clinical    |
| Required-field marker                       | red `*` after the label                                                                          | Standard, low-noise                    |
| Inline helper text                          | _"Ask the owner for this code"_ under the Family Master Key field                                | Plain answers to plain questions       |
| Confirmation buttons are verbs              | _"Log In"_, _"Create Account"_, _"Save"_, _"Cooked this"_                                        | Action-led                             |
| Stats are spoken                            | _"Cooked 3 times · 4.3⭐"_, _"Last updated by Mom on Jan 5: Reduced garlic from 6 cloves to 3."_ | Reads like a sentence, not a dashboard |
| "Optional" is in parentheses                | _"Caption (optional)"_, _"Add Recipe Details (Optional)"_                                        | Trust the user; don't bury options     |

### Vibe

A shared notebook. The same casual register a family text thread has. Quiet chrome, expressive content. _"Made with ❤️ for my family."_

---

## VISUAL FOUNDATIONS

### Palette

A **near-grayscale neutral system** with a small set of semantic accents:

- **Surfaces**: `--color-gray-50` (page background, `oklch(.985 .002 247.839)`) and pure `#fff` (cards).
- **Borders**: `--color-gray-200` (`oklch(.928 .006 264.531)`) for hairline card borders; `--color-gray-300` for inputs and the dashed photo placeholder.
- **Text**: `--color-gray-900` for headings/strong, `--color-gray-700` for body, `--color-gray-600` for meta, `--color-gray-500` for captions/timestamps, `--color-gray-400` for inactive icons / placeholder.
- **Primary action**: `--color-gray-800` (`oklch(.278 .033 256.848)`, a near-black) on **white text**. Used for the main CTA, the "+" FAB, the active tag chip, the active difficulty pill.
- **Secondary tag chip**: `--color-gray-200` background, `--color-gray-700` text.
- **Muted recipe-card chip**: `--color-gray-100` background, `--color-gray-600` text.
- **Destructive**: `--color-red-500/600` for "Log Out", delete icons, error helper text. Plus `--color-red-400` border on a field with an inline error.
- **No brand hue.** No blue, no green, no orange, no purple. The single chromatic note is the destructive red.

### Type

A **two-family system**: Fraunces for display (headings, recipe titles), and the system sans stack for body. Fraunces is a variable serif with **opsz** (optical size 9–144), **wght** (100–900), **SOFT** (0–100, softens corners) and **WONK** (0/1, expressive italic alternates) axes — we use `opsz` matched to size and a small `SOFT 50` to keep headings warm and friendly without going cute.

Body / UI text continues to use the codebase's Tailwind v4 default sans stack (`ui-sans-serif, system-ui, …`) — quiet, neutral, fast.

Font files live in `fonts/`:

- `Fraunces-VariableFont_SOFT_WONK_opsz_wght.ttf`
- `Fraunces-Italic-VariableFont_SOFT_WONK_opsz_wght.ttf`

**Scale (from `figma/src/index.css`):**

| Token         | Size            | Used as                                              |
| ------------- | --------------- | ---------------------------------------------------- |
| `--text-2xl`  | 1.5rem / 24px   | h1 (page title, recipe title)                        |
| `--text-xl`   | 1.25rem / 20px  | h2 (section header)                                  |
| `--text-lg`   | 1.125rem / 18px | h3 (subsection — Ingredients, Steps, Comments)       |
| `--text-base` | 1rem / 16px     | h4, p, label, button, input                          |
| `--text-sm`   | 0.875rem / 14px | secondary copy, tab labels, comment body, list items |
| `--text-xs`   | 0.75rem / 12px  | timestamps, helper text, tag chips, stats labels     |

**Weights:** 400 (normal) and 500 (medium) only. The app uses `medium` for all headings and buttons; `normal` for body and inputs. **There is no bold (700) anywhere in the wireframes.**

**Line-height:** consistent **1.5** across every text role.

### Spacing

Tailwind's `--spacing: 0.25rem` (4px) base. Everything is a multiple of 4. Common values seen in the export: 4, 8, 12, 16, 24, 32, 48px. Cards have `p-4` (16px) interior padding; screen sections have `px-6 py-4` (24/16); the form scroller has `px-6 py-12` for auth screens.

### Backgrounds

- **Page**: solid `gray-50`, never gradient, never pattern, never image.
- **Card / modal / header**: solid white.
- **No textures, no illustrations, no full-bleed brand imagery.** The only "imagery" is **user-uploaded photos** of food, which are framed as `rounded-lg` rectangles inside cards. Photo placeholders are flat `gray-200` blocks.

### Animation

Bone-quiet. Tailwind's defaults are the only motion in the export:

- `--default-transition-duration: 0.15s`
- `--default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)` (the standard ease-in-out)
- One `transition-transform` use: the chevron on the collapsible Recipe Details section rotates 180° when expanded.

**No fades, no bounces, no springs, no skeletons, no entrance animations.** State changes are instant. This matches the cozy, low-stakes vibe.

### Hover and press states

- **Hover**: not specified in the wireframes — they're mobile-first and tap-driven. Recommendation: subtle background tint shift (`gray-100` → `gray-200`) or 80% opacity for icon buttons. Don't add color shifts that imply branding the app doesn't have.
- **Press / active**: filled primary state (`gray-800` bg + white text) — used as the "selected" state for course pills, difficulty pills, and active tag chips. There is no separate "pressed" visual; selected = filled.
- **Focus**: ring color is `oklch(0.708 0 0)` — a neutral 50%-gray ring (no brand color).

### Borders

- Hairline `1px` solid for cards, headers, footers, inputs (`gray-200` for cards/headers, `gray-300` for inputs).
- `2px` solid bottom for the active profile tab (`gray-900`).
- `2px` dashed `gray-300` for the photo upload placeholder.
- `4px` solid `gray-800` for the **mobile device frame** (a wireframe convention; not part of the real app chrome).

### Shadows

Almost none in the actual UI. The only shadow in the export is `shadow-xl` on the device-frame mockup itself:

`0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)`

Real cards inside the app rely on **borders, not shadows**, for separation. This is intentional: borders are crisp and predictable on mobile; shadows muddle.

### Capsules vs gradients

No protection gradients. No glass / blur. The only translucency is `bg-white/50` on **inactive carousel dots** in the photo gallery — a simple 50% white over the image.

### Layout rules

- **Fixed elements**: top header (`bg-white border-b`), bottom tab bar (`bg-white border-t`). Both are non-scrolling. Content scrolls between them.
- **Single column**, full width of the 375px frame minus 16–24px gutters.
- **Section breaks** are done with `bg-gray-50` gaps between white card-sections, plus 1px gray borders.
- **No sidebars on mobile.** Desktop polish (a real second-class concern per the brief) would constrain content to a centered 600–720px column rather than introducing a chrome.

### Transparency and blur

Used minimally: only `bg-white/50` on inactive dots. **No backdrop-blur anywhere.**

### Color vibe of imagery

User photos are unmodified — no warm/cool grading, no grain, no overlay. The **placeholders** are flat `gray-200` (cool, neutral). Recommendation in production: don't apply a tint or filter; let family photos look like family photos.

### Corner radii

A handful of consistent values:

| Token                           | Value             | Used as                                       |
| ------------------------------- | ----------------- | --------------------------------------------- |
| `rounded`                       | 4px               | recipe-card chip (`gray-100` muted)           |
| `--radius`                      | 10px (`0.625rem`) | inputs, secondary buttons, photo placeholders |
| `--radius` + 4px (`rounded-xl`) | 14px              | **cards** (the dominant container shape)      |
| `--radius-2xl`                  | 16px              | logo placeholder square                       |
| `rounded-full`                  | pill              | tag chips, course pills, "+" FAB, avatars     |
| `rounded-[40px]`                | 40px              | mobile device-frame mockup outer              |

The signature shape of the system is the **14px-radius white card with a 1px gray-200 border, no shadow**.

### What "a card" looks like

```
background: #fff
border: 1px solid var(--color-gray-200)
border-radius: 14px (rounded-xl)
padding: 16px (p-4)
no shadow
```

That's it. Repeated across timeline activity items, recipe rows, family-member rows, profile sub-cards, comment composers — everywhere.

### Density

Generous, not dense. Items in lists are separated by `space-y-3` (12px gaps) and have `p-3`–`p-4` interior padding. Compare to NYT Cooking (denser) or Goodreads (chattier). Family Recipe is closer to **Apple Notes / Things** in rhythm: roomy, calm, easy to thumb through.

---

## ICONOGRAPHY

**Lucide React** is the icon system. Imported per-component as `import { Home, Book, Plus, User, ... } from 'lucide-react'`. We've inventoried the icons used across the wireframes — there's no internal icon font, no SVG sprite, no custom set.

### Icons used in the product (from the Figma export)

| Icon             | Used for                                                             |
| ---------------- | -------------------------------------------------------------------- |
| `Home`           | Timeline tab                                                         |
| `Book`           | Recipes tab                                                          |
| `Plus`           | "New post" FAB                                                       |
| `User`           | Profile tab                                                          |
| `FileText`       | "X posted Y" timeline entry                                          |
| `MessageCircle`  | "X commented on Y" timeline entry                                    |
| `ChefHat`        | "X cooked Y" timeline entry                                          |
| `Search`         | recipe search bar                                                    |
| `ChevronDown`    | filter dropdowns, collapsible expander                               |
| `ArrowLeft`      | back button                                                          |
| `MoreVertical`   | overflow menu                                                        |
| `Camera`         | photo upload, comment-with-photo                                     |
| `Bookmark`       | favorite toggle                                                      |
| `Heart` / `Star` | imported but reactions are emoji in the actual Timeline + PostDetail |
| `Trash2`         | delete (comment, family member)                                      |
| `X`              | dismiss / close                                                      |
| `Users`          | "Family Members" CTA on Profile                                      |
| `LogOut`         | "Log Out" CTA on Profile                                             |
| `AlertCircle`    | inline form error                                                    |

### Stroke and size

Lucide defaults: **2px stroke**, **24px** for navigation/chrome (`size={24}`), **20px** for inline action icons next to text, **18px–14px** for compact / dense affordances (small delete buttons, error indicators). Color is always inherited from the surrounding text color — usually `gray-500`/`gray-600` for secondary, `gray-900` for active.

### Strategy in this design system

We **did not** import Lucide as files into `assets/icons/`. Instead, the recommended approach is identical to the codebase: import from Lucide on the CDN (or as `lucide-react` in a Next.js project). The UI kit's `index.html` loads Lucide as a script tag and uses `lucide.createIcons()` to render them inline. See `ui_kits/family-recipe-app/index.html`.

### Emoji vs icons

Already covered in CONTENT FUNDAMENTALS: **emoji is for user-generated reactions only** (❤️ 😋 👍 ⭐). Navigation, status, actions, section icons — all Lucide line icons. Don't put emoji in chrome.

### Logo / wordmark

There is **no shipped logo**. Both auth screens use a 64×64 `gray-300` rounded square with a literal 🍳 emoji inside as a placeholder. We've kept this placeholder in the design system and noted it in the brand cards. See "Open questions" below.

---

## Decisions (locked)

1. **Palette** — **Grayscale, as shipped.** The warmth comes from Fraunces, not color. Fighting the Figma source adds design debt; warm-tone variant is a clean follow-up ticket.
2. **Type pairing** — **Fraunces (display) + system sans stack (body).** No paired web-body face. Quiet chrome, expressive content; zero extra web-font load on the most-rendered text. DM Sans / Inter Tight would compete with Fraunces' warmth. Easy to layer in later if it feels too plain.
3. **Logo** — **Wordmark in Fraunces** ("Family Recipe", SOFT 50, opsz 48, weight 500). Drop the 🍳 emoji on auth. A real mark is its own ticket — don't block on it.

## Notes

- **No AddPost screen in the kit yet.** Ticket POC is navbar + timeline card + add-recipe form. The design system specs everything needed (Primitives, chip variants, photo placeholder, microcopy patterns) — port the existing AddPost layout 1:1 with the new primitives. Lower risk than a fresh design round.
- **Tailwind v3, not v4.** Codebase uses v3; port tokens via `theme.extend` rather than `@theme`. No blockers.

## Open questions

- **Desktop polish.** Brief calls it "a real second-class concern" — confirm a target (centered 600–720px column? sidebar?) or stay mobile-only.
- **Hover states.** Mobile-first wireframes don't define them. Recommendation: `gray-100 → gray-200` tint. Confirm.

See SKILL.md for usage as an Agent Skill.
