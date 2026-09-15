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
