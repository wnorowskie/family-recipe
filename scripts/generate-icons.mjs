// Exports the PNG icon set from the single SVG source (#348).
//
//   node scripts/generate-icons.mjs
//
// Uses `sharp` as a transitive dependency of Next, on purpose: listing it in
// devDependencies flips its `@img/sharp-*` platform binaries to dev-only in the
// lockfile, and the Dockerfile's `npm ci --omit=dev` runtime stage then drops
// them while keeping the JS wrapper — breaking Next's image optimizer in prod.
//
// Every output is a plain resize of src/app/icon.svg — the source keeps its
// glyph inside the central 80% safe zone, so the maskable variant needs no
// extra padding.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Paths resolve against the repo root, not the cwd, so the documented command
// works from anywhere.
const repoPath = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SOURCE = repoPath('src/app/icon.svg');

const OUTPUTS = [
  // iOS home-screen icon (Next file convention → <link rel="apple-touch-icon">).
  // iOS ignores transparency; the source background is opaque so this is safe.
  { path: 'src/app/apple-icon.png', size: 180 },
  // Web app manifest icons (consumed by #349).
  { path: 'public/icons/icon-192.png', size: 192 },
  { path: 'public/icons/icon-512.png', size: 512 },
  { path: 'public/icons/icon-maskable-512.png', size: 512 },
];

const svg = await readFile(SOURCE);

for (const { path, size } of OUTPUTS) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(repoPath(path));
  console.log(`wrote ${path} (${size}x${size})`);
}
