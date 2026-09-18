/**
 * Client-side mirror of the root layout's theme rule (#155).
 *
 * `RootLayout` sets `<html data-theme>` from the `theme` cookie at SSR time.
 * It is a server component, so it does not re-render across a client-side
 * `router.replace` — whatever attribute the current page was SSR'd with
 * persists onto the next route. After login/signup the cookie is already
 * correct (FastAPI sets it on the auth response), but the page the user
 * landed on was SSR'd without it, so the attribute has to be applied here
 * as well or a Warm & Cozy user sees grayscale until the next full load
 * (#324). The Appearance toggle uses the same helper for its optimistic
 * update.
 *
 * Only the literal `'warm'` opts in; anything else (`'grayscale'`, absent,
 * unknown) is the default and clears the attribute — same as the layout.
 */
export function applyThemeToDocument(theme: string | null | undefined): void {
  if (theme === 'warm') {
    document.documentElement.setAttribute('data-theme', 'warm');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Server-side mirror of the same rule, for the `theme-color` meta (#349).
 *
 * The browser/OS chrome around an installed PWA (iOS status bar, Android
 * task switcher) is painted from `<meta name="theme-color">`, which can't
 * read a CSS custom property — so the page background token
 * (`--bg-page` → `--color-gray-50`) is duplicated here as the sRGB hex of
 * each theme's OKLCH value in src/app/globals.css. If either token changes,
 * update both.
 */
export const PAGE_THEME_COLOR = {
  default: '#f9fafb', // oklch(0.985 0.002 247.839) — Tailwind gray-50
  warm: '#f9f4ec', // oklch(0.97 0.012 80) — unbleached cream
} as const;

export function pageThemeColor(theme: string | null | undefined): string {
  return theme === 'warm' ? PAGE_THEME_COLOR.warm : PAGE_THEME_COLOR.default;
}
