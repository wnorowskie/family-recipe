import type { MetadataRoute } from 'next';
import { PAGE_THEME_COLOR } from '@/lib/theme';

/**
 * Web app manifest (#349) — served by Next at /manifest.webmanifest and
 * linked from <head> automatically. Makes the site installable from iOS
 * Safari (Share → Add to Home Screen) and Android Chrome.
 *
 * `theme_color` here is static; the live `<meta name="theme-color">` follows
 * the active theme via `generateViewport` in src/app/layout.tsx. Icon paths
 * come from #348 (see public/icons/README.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Family Recipe',
    short_name: 'Recipes',
    description: 'Share and preserve family recipes',
    start_url: '/',
    display: 'standalone',
    background_color: PAGE_THEME_COLOR.default,
    theme_color: PAGE_THEME_COLOR.default,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
