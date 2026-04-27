# Family Recipe App — UI Kit

Mobile-first React/JSX recreation of the Family Recipe app, a private family-only space for sharing recipes and the cooking activity around them. Built from the wireframes in the `wnorowskie/family-recipe` repo (Figma node `Frame 6` — full app flow).

## Frames included

1. **AuthLogin** — Email/password sign-in with create-account secondary action.
2. **Timeline** — Mixed feed of "posted", "commented" and "cooked this" activity cards.
3. **PostDetail** — Recipe detail with photo carousel, tags, ingredients, steps, version note, reactions, comments.
4. **RecipesBrowse** — Searchable recipe library with course/tag filters and chip filter row.
5. **Profile** — User stats, posts/cooked/favorites tabs, family + log out actions.

## Components

- **Primitives** — `Avatar`, `Chip` (active / soft / outline / muted), `Button` (primary / secondary / text / destructive)
- **Cards** — `TimelineCard`, `RecipeRow`, `CommentItem`
- **Frame** — `MobileFrame` (375 × 812, 4px black border, 40px radius)
- **Chrome** — `Header`, `BottomTabBar` (with center FAB)
- **Field** (in `AuthLogin.jsx`) — labeled input with helper / error states

## Visual rules

- Surfaces stack: `--bg-page` (#F9FAFB) behind `#FFFFFF` cards bordered with `--border-card` (#E5E7EB).
- Primary action: `--bg-primary` (#374151) — flat dark slate, no gradient.
- Radii: cards 14px, inputs/buttons 10px, chips 9999px (pills).
- Icons: Lucide via CDN, 18–24px, stroke 2.
- Type: system sans (Helvetica / SF / Segoe stack). Headings 500 weight, body 400.

## Caveats

- The repo only contained Figma wireframes (gray placeholders) — no production CSS or photographic content. Photos are gray rectangles.
- The brief described "warm browns, muted greens" but the actual wireframes are neutral gray. The kit follows the **wireframes** and surfaces a `--bg-primary-warm` token (#A47148) ready to swap.
- Activity verb icons (`file-text`, `message-circle`, `chef-hat`) are Lucide stand-ins.

## Files

```
index.html        Click-thru harness rendering all 5 frames
README.md         (this)
Primitives.jsx    Avatar, Chip, Button
Cards.jsx         TimelineCard, RecipeRow, CommentItem
Header.jsx        Top header
BottomTabBar.jsx  Bottom nav with center FAB
MobileFrame.jsx   Phone bezel
AuthLogin.jsx     Screen 1 + Field
Timeline.jsx      Screen 2
PostDetail.jsx    Screen 3 + ReactionBtn
RecipesBrowse.jsx Screen 4 + FilterBtn
Profile.jsx       Screen 5 + Stat, TabBtn, CookedItem
```
