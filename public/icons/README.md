# App icons

Generated files — do not edit by hand. The single source of truth is
[`src/app/icon.svg`](../../src/app/icon.svg); regenerate everything with:

```bash
node scripts/generate-icons.mjs
```

| File                                 | Size    | Used by                                                          |
| ------------------------------------ | ------- | ---------------------------------------------------------------- |
| `src/app/icon.svg`                   | vector  | Favicon (`<link rel="icon">`, Next file convention)              |
| `src/app/apple-icon.png`             | 180×180 | iOS home screen (`<link rel="apple-touch-icon">`)                |
| `public/icons/icon-192.png`          | 192×192 | Web app manifest (#349)                                          |
| `public/icons/icon-512.png`          | 512×512 | Web app manifest (#349)                                          |
| `public/icons/icon-maskable-512.png` | 512×512 | Web app manifest, `purpose: "maskable"` (Android adaptive icons) |

The glyph in the source sits inside the central 80% circle, so the maskable
export is the same image as `icon-512.png` — Android crops it to a circle or
squircle without clipping the bowl. Check with https://maskable.app/ after any
change to the SVG.

To swap in a real logo later: replace `src/app/icon.svg` (keep the full-bleed
background and the 80% safe zone), rerun the script, and commit the outputs.
No path in the manifest or layout changes.
