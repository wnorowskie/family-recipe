// Exports the PNG icon set from the single SVG source (#348).
//
//   node scripts/generate-icons.mjs
//
// Uses `sharp`, which is already a transitive dependency of Next. Every output
// is a plain resize of src/app/icon.svg — the source keeps its glyph inside the
// central 80% safe zone, so the maskable variant needs no extra padding.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = new URL('../src/app/icon.svg', import.meta.url);

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
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path);
  console.log(`wrote ${path} (${size}x${size})`);
}
