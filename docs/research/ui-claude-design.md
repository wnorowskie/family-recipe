# UI improvements via Claude Design

**Issue:** [#41 — research: UI improvements using Claude Design](https://github.com/wnorowskie/family-recipe/issues/41)

## Decision

Use **Claude Design** (Anthropic Labs, research preview) to drive the V1 UI revamp, with **"Handoff to Claude Code"** as the bridge into this repo. Claude Design extracts a persisted, org-level design system from our codebase + visual references, generates redesigned screens in-canvas, and exports a tarball (tokens CSS, fonts, JSX prototypes, Lucide icon strategy, voice/copy guide, installable Claude Code skill) that Claude Code translates into Tailwind + React changes against the existing `src/components/` tree. No parallel design system, no rewrite — incremental upgrades only.

**Validated end-to-end on this spike** — the handoff bundle from `https://api.anthropic.com/v1/design/h/IcDALLIxEMAV65Uus9ikFw` was fetched, unpacked, and reviewed against the prioritized improvement list. All five of Claude Design's open questions were closed (see [POC results](#poc-results)). Six follow-up tickets are unblocked.

The two alternatives considered (Claude.ai Artifacts standalone, Claude Code + Playwright alone) were rejected because neither persists a design system or gives Claude Code an aesthetic target to translate against — see [Alternatives](#alternatives-considered).

## Answers to the ticket's questions

### 1. Which Claude product fits a Next.js App Router + Tailwind app?

**Claude Design**, paired with Claude Code for implementation. Claude Design specifically supports linking a code repository so generated prototypes "reach for your real colors, typography, and components instead of generic placeholders," and its `Handoff to Claude Code` export is built for the case where the designed canvas needs to land as code in an existing repo. Available on Pro/Max/Team/Enterprise.

The server/client split is preserved by the implementation step (Claude Code), not by Claude Design itself — Claude Design produces design output (HTML/handoff brief), Claude Code is the side that knows about `'use client'`, server components, `getCurrentUser`, etc.

### 2. Highest-impact UI improvements to target first

Derived from a survey of `src/components/` and `src/app/(app)/` (see [survey notes](#appendix-current-ui-survey)). Effort is rough — half a day = 4h, day = 8h.

| #   | Improvement                                                                                                                    | Effort | Why it matters                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Replace emoji nav + action icons with a real icon library** (lucide-react)                                                   | 0.5d   | User-stated #1 priority; current nav uses 🏠 📚 ➕ 👤 🔔 — direct cause of "rough" feel                          |
| 2   | **Extract `@/components/ui` primitives** (Button, Input, Card, Badge) from inline Tailwind, applied to the 3 POC screens first | 1d     | Today: 5+ button patterns, 4 border-radius variants, 3 shadow scales scattered across 10 components              |
| 3   | **Timeline card redesign** (POC screen 2)                                                                                      | 0.5d   | Most-viewed surface; currently a flat `rounded-2xl shadow-sm` block with no visual hierarchy between event types |
| 4   | **Navbar redesign** (POC screen 1)                                                                                             | 0.5d   | On every page; no-emoji modern feel anchors the rest of the system                                               |
| 5   | **Add-recipe form redesign** (POC screen 3)                                                                                    | 1d     | Densest screen (1131 LOC in PostDetailView's sibling); biggest cleanup payoff                                    |
| 6   | **Warm-neutral palette + typography token pass** (CSS vars in `globals.css` + `tailwind.config.js`)                            | 0.5d   | Unblocks consistent dark mode later; today only `--background`/`--foreground` exist                              |
| 7   | **Desktop polish**: add `lg:` / `xl:` breakpoint coverage so 1280px+ doesn't have huge dead bands around a `max-w-3xl` column  | 0.5d   | Currently mobile-first works, desktop is unstyled-by-default                                                     |
| 8   | **Skeleton loading states** (replace text-only "Loading..." button states)                                                     | 0.5d   | Cheap perceived-performance win                                                                                  |
| 9   | **Inline form validation pattern** (consistent error-under-field)                                                              | 0.5d   | Today errors render inconsistently per-form                                                                      |
| 10  | **Empty-state variant for search** (recipes browser "no results")                                                              | 0.25d  | Existing EmptyState component covers timeline-empty but not search-empty                                         |

**POC scope (issue's "1–2 proof-of-concept screens" deliverable):** items 1, 3, 4, 5 — navbar + timeline card + add-recipe form, riding on top of the primitive extraction in item 2.

### 3. How well does this preserve `src/components/` vs. rewrite?

**Well, by construction** — Claude Design generates standalone HTML in canvas; the _implementation_ step in this repo is bounded to the three POC screens and the new `@/components/ui` primitives. The existing component files in `src/components/{add,timeline,navigation}/` are edited in place to consume the new primitives — they are not deleted or replaced wholesale. Files outside the three POC surfaces are untouched in this round.

The risk is scope creep: once primitives exist, every component looks like it "needs" updating. **Hard rule for this round: only the three POC screens migrate. Other components stay on inline Tailwind until a follow-up ticket.**

### 4. Review / merge workflow

One PR per POC screen, on this `research/41/ui-claude-design` branch's children. Each PR:

1. Branch from `develop`: `feature/41-N/<screen>-redesign`
2. Body includes the Claude Design canvas link, the before-screenshot from `docs/research/screenshots/ui-claude-design/`, and an after-screenshot captured via Playwright MCP
3. Verification per [docs/verification/ui.md](../verification/ui.md)
4. Reviewed by repo owner; revertable independently if one screen lands worse than the others

The `@/components/ui` primitives land in their own preceding PR (item 2 above) so each screen PR is a small consumer change.

### 5. Repo-specific gotchas

- **Large repo lag.** Claude Design docs note "Large repositories may cause lag." This repo has three runtimes (Next + FastAPI + importer). Linking the full repo is acceptable per user direction, but if Claude Design slows down, fall back to a curated zip of `src/components/`, `src/app/(app)/`, `src/app/globals.css`, `tailwind.config.js`, `package.json`.
- **Tailwind config is minimal.** Only `colors.background`/`colors.foreground` are extended. The design-system pass should add a real palette + spacing + radius scale to `tailwind.config.js` — not just CSS vars in `globals.css` — so utility classes can reference tokens (`bg-warm-50` etc.) instead of arbitrary hex.
- **Server/client boundary.** Claude Design output is plain HTML. Implementing it must respect that data-fetching components in `src/app/(app)/*/page.tsx` are server components; only interactive children (forms, the Add page's drag-reorderable ingredients) are `'use client'`. See [src/lib/CLAUDE.md](../../src/lib/CLAUDE.md) and the parent [CLAUDE.md](../../CLAUDE.md#conventions-worth-knowing).
- **Photo storage signed URLs.** Any new image rendering in the redesigns must continue to use the signed-URL resolver pattern in [src/lib/uploads.ts](../../src/lib/uploads.ts) — DB stores opaque `storageKey`, never URLs. Don't let a redesigned timeline card start hard-coding `/uploads/...` paths.
- **No emoji in nav is a stated user requirement.** Adding `lucide-react` (~6KB tree-shaken per icon) is the cleanest path. Heroicons is a viable alternative (Tailwind-aligned, slightly larger). Don't roll custom SVGs unless the design demands it.
- **a11y baseline is acceptable but thin.** The redesign should preserve existing `aria-current`, `aria-label`, `aria-pressed`, `aria-modal` usage (26 instances surveyed) and add skip links + `aria-describedby` for form errors as a side-benefit, not a gate.
- **Playwright fixtures.** Run `SEED_E2E=1 npm run db:seed` before manual / browser verification — gives deterministic timeline content (one of each event type) to design and screenshot against.

## Workflow (concrete steps)

| Phase                  | Driver                        | Action                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Design system setup | User (browser, Claude Design) | Link family-recipe repo. Upload 2–3 visual references (Goodreads, DoorDash, NYT Cooking — soft cozy direction). Configure name `Hearth` (or `Family Recipe`) + warm-family-neutral / casual-typography / no-emoji blurb. Publish. |
| 2. Per screen (×3)     | User (browser, Claude Design) | Prompt for redesigned navbar → timeline card → add-recipe form, in that order. Iterate via chat/comments until approved. Export via `Handoff to Claude Code`.                                                                     |
| 3. Implementation      | Claude Code (this repo)       | Add `lucide-react`. Create `@/components/ui` primitives from the design system tokens. Translate each handoff into edits against the existing component files. Capture after-screenshots with Playwright.                         |
| 4. Review              | Repo owner                    | One PR per screen on `develop`. Independent revertability.                                                                                                                                                                        |

## Alternatives considered

**Claude.ai Artifacts (standalone).** Generates one-off interactive React/HTML components in chat. Rejected: no persisted design system, no codebase awareness, no handoff path — every screen would re-derive the visual language from scratch and the resulting code would not know about our `'use client'` boundaries or photo signed-URL pattern.

**Claude Code + Playwright MCP alone.** Could refactor inconsistencies (extract Button, unify radius scale) and verify visually via screenshots. Rejected: no aesthetic target — Claude Code without a designed mock would produce a _cleaner_ version of the current visual language, not a _redesigned_ one. The user's stated goals (warm-cozy feel, no-emoji nav, more casual typography) are visual judgments that need a designer-style canvas, not just a code refactor.

**Figma + Claude.** Rejected: requires designing in Figma first, defeats the point of using AI-driven design. Also adds a tool the project doesn't already have.

## Appendix: current UI survey

Survey performed on this branch (April 2026). Component inventory and ad-hoc styling patterns are documented in conversation context for this ticket, not duplicated here. Key findings that informed the priority list:

- **No `@/components/ui` primitives** — every component uses inline Tailwind; ~5 button patterns, 4 radius variants, 3 shadow scales scattered across 10 component subdirectories.
- **Bottom nav** uses 4 emoji glyphs (🏠 📚 ➕ 👤) plus a 🔔 in the header — direct cause of the "rough" perception.
- **Tailwind config** extends only `colors.background` and `colors.foreground`. No spacing, radius, or shadow scale customization.
- **Mobile-first responsiveness** with `sm:` and `md:` breakpoints; `lg:` only appears once. `max-w-3xl` content column leaves ~280px dead bands on each side at 1280px desktop.
- **a11y baseline acceptable** — semantic nav, aria-\* attributes (26 instances), focus rings on inputs. Missing: skip links, `aria-describedby` for errors, `aria-live` for notifications.

Before-screenshots for the three POC surfaces are in [`screenshots/ui-claude-design/`](screenshots/ui-claude-design/):

- `before-mobile-timeline-viewport.png` / `before-mobile-timeline-full.png`
- `before-mobile-add-viewport.png` / `before-mobile-add-full.png` / `before-mobile-add-recipe-expanded-full.png`
- `before-desktop-timeline-viewport.png` / `before-desktop-add-viewport.png`

## POC results

The Claude Design canvas → Handoff to Claude Code round completed end-to-end. The handoff bundle was retrieved from `https://api.anthropic.com/v1/design/h/IcDALLIxEMAV65Uus9ikFw` (gzipped tarball, 880KB extracted). The `README.md`, `colors_and_type.css`, and `SKILL.md` are committed under [`handoff-ui-claude-design/`](handoff-ui-claude-design/) as a stable local reference for the implementation tickets — the URL may not stay live indefinitely.

### What Claude Design produced

- **Tokens** ([`handoff-ui-claude-design/colors_and_type.css`](handoff-ui-claude-design/colors_and_type.css)) — full grayscale palette (gray-50 through gray-900 in `oklch`), red destructive accent, semantic surface/text/border tokens, type scale (xs–2xl), spacing scale, radii scale, motion tokens. Tailwind-version-agnostic CSS custom properties.
- **Fonts** — Fraunces variable TTFs (regular + italic) with SOFT/WONK/opsz/wght axes. Not committed in this research dir — they'll move to `public/fonts/` in the foundation ticket.
- **Design system documentation** ([`handoff-ui-claude-design/DESIGN_SYSTEM_README.md`](handoff-ui-claude-design/DESIGN_SYSTEM_README.md)) — voice/tone, casing, microcopy patterns, palette, type, spacing, borders, shadows (almost none — the system uses borders for separation), corner radii (the signature shape is the **14px-radius white card with 1px gray-200 border, no shadow**), iconography (Lucide React), emoji policy (UGC reactions only, never chrome).
- **JSX prototypes** — Primitives (Button, Chip, Avatar) + per-screen kits (Header, BottomTabBar, Timeline, PostDetail, RecipesBrowse, Profile, AuthLogin). These are _prototypes_, not production code — the handoff README explicitly directs implementers to "match the visual output, don't copy the prototype's internal structure."
- **Skill manifest** ([`handoff-ui-claude-design/SKILL.md`](handoff-ui-claude-design/SKILL.md)) — installable as a Claude Code skill so future design work in this codebase can re-use the system without re-fetching.

### Closed open questions

Claude Design surfaced five open questions; user decisions made on each:

| Question                                                             | Decision                                                                    | Rationale                                                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body type — keep system sans or pair with a specific sans?           | **Keep system sans**                                                        | "Quiet chrome, expressive content" — Fraunces does the personality work; zero web-font load on body = better mobile perceived perf, no FOUC; pairing would compete with Fraunces        |
| Palette — shipped grayscale or warm-cozy variant per original brief? | **Stick with grayscale for V1**                                             | Grayscale + Fraunces is genuinely cozy (warmth comes from typography, not color); fighting the source-of-truth Figma adds design debt; warm variant deferred to its own research ticket |
| Logo — drop a real wordmark?                                         | **Use a Fraunces wordmark** ("Family Recipe", SOFT 50, opsz 48, weight 500) | No real logo exists; a wordmark reads as intentional, not placeholder; a custom mark is its own design ticket                                                                           |
| Desktop polish — target layout?                                      | **Centered 600–720px column on desktop**, no chrome                         | Per the design system's own "Layout rules" recommendation; closes the dead-band issue at 1280px+; deferred to its own ticket                                                            |
| Hover states — gray-100 → gray-200 tint?                             | **Confirmed**                                                               | Matches the system's "no brand color" rule                                                                                                                                              |

### Gaps in the handoff (carried into implementation tickets)

- **No AddPost screen** in the kit — the kit shipped Timeline / PostDetail / RecipesBrowse / Profile / AuthLogin but the AddPost form layout was not drawn. A follow-up Claude Design round was prompted; the result will land in the AddPost implementation ticket, not in this research doc.
- **Tailwind v3, not v4.** The handoff README assumed Tailwind v4 + `@theme` syntax. This repo is on Tailwind v3 — tokens will be ported via `theme.extend` and CSS custom properties in `globals.css` instead.

### Implementation tickets unblocked

Per [docs/research/README.md](README.md) and the issue's "unblocks follow-up feature tickets" output, this spike unblocks:

1. **chore: design system foundation** — Fraunces via `next/font/local`, port tokens, add `lucide-react`, create `src/components/ui/` primitives. No visible UI change.
2. **feature: redesign bottom navbar with Lucide icons** — replaces emoji nav per the kit's `BottomTabBar.jsx`.
3. **feature: redesign timeline cards with one-sentence headlines** — line-icon-on-left + sentence headline ("Mom posted 'Lemon Chicken'") per the kit's `Timeline.jsx`.
4. **feature: restyle add-recipe form with new primitives** — applies the foundation primitives to the existing `AddPostForm` / `AddRecipeForm`. Pixel reference comes from the AddPost Claude Design round.
5. **research: warm-cozy palette variant exploration** — deferred Claude Design round on top of the shipped grayscale tokens.
6. **feature: desktop polish — content column + lg/xl breakpoints** — constrains desktop to a centered 600–720px column.

The first four ship the V1 visible upgrade. #5 and #6 are independently scoped follow-ups.

### Validated workflow assessment

The end-to-end loop **works as advertised**:

- **Setup → output time**: ~hours, mostly user-driven canvas iteration. Claude Design did the codebase-introspection step itself (linked the GitHub repo, found and read the `figma/` folder, extracted the source-of-truth palette and types).
- **Output quality**: production-grade documentation + tokens; prototype-grade JSX (intentionally — the handoff README directs implementers not to port literally).
- **Collaboration model**: clean split. User drives Claude Design (browser); Claude Code drives implementation (CLI); the handoff URL is the boundary. No tool-use blockers — Claude Code can `WebFetch` the handoff bundle directly, no auth required for the handoff URL.
- **Caveats observed**: the user-facing canvas UX had some friction (lag on the linked repo, comment-loss issues per Anthropic's own docs) but did not block the deliverable.

**Recommendation stands**: Claude Design + Handoff to Claude Code is the right workflow for ongoing UI work in this repo, not just this V1 revamp. The shipped `SKILL.md` makes the design system installable as a Claude Code skill, so subsequent design rounds for new features (e.g. notifications redesign, search empty-state) can re-use it without re-bootstrapping.
