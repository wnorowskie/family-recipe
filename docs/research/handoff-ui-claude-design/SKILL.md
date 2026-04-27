---
name: family-recipe-design
description: Use this skill to generate well-branded interfaces and assets for the Family Recipe app, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference

- **Tokens**: `colors_and_type.css` — drop into any HTML file via `<link rel="stylesheet">`.
- **Fonts**: `fonts/Fraunces-*.ttf` (variable, with SOFT/WONK axes). Body uses system sans stack.
- **UI kit**: `ui_kits/family-recipe-app/` — JSX components + click-thru `index.html`.
- **Voice**: family group chat, sentence case, first names ("Mom", "Dad"), no marketing tone.
- **Icons**: Lucide via CDN (`<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>` + `lucide.createIcons()`).
- **Cards**: white, 1px gray-200 border, 14px radius, no shadow. The signature shape.
- **Primary CTA**: `--bg-primary` (near-black gray-800), white text, 10px radius.
