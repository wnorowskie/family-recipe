import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import './globals.css';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';
import { pageThemeColor } from '@/lib/theme';

const fraunces = localFont({
  src: [
    {
      path: '../../public/fonts/Fraunces-VariableFont_SOFT_WONK_opsz_wght.ttf',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../../public/fonts/Fraunces-Italic-VariableFont_SOFT_WONK_opsz_wght.ttf',
      weight: '100 900',
      style: 'italic',
    },
  ],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Family Recipe',
  description: 'Share and preserve family recipes',
  // Installed-PWA chrome on iOS (#349). Next's `appleWebApp.capable` emits
  // the standard `mobile-web-app-capable`; the Apple-prefixed twin is what
  // iOS < 17.4 reads, so it goes through `other`.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Family Recipe',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

/**
 * `theme-color` follows the active theme (#349) using the same synchronous
 * cookie read as `RootLayout` below — not a FastAPI call — for the same
 * rate-limit reason. Next keeps its default `width=device-width,
 * initial-scale=1` viewport alongside whatever is returned here.
 */
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  return { themeColor: pageThemeColor(cookieStore.get('theme')?.value) };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Flash-free theme (#155): a synchronous cookie read, not a FastAPI call —
  // `GET /v1/auth/session` is a shared, rate-limited household budget
  // (apps/api/CLAUDE.md) and (app) pages already spend it twice per render.
  // Anything other than the literal 'warm' (absent, tampered, pre-migration
  // browser) renders as the default grayscale theme.
  const cookieStore = await cookies();
  const isWarm = cookieStore.get('theme')?.value === 'warm';

  return (
    <html
      lang="en"
      className={fraunces.variable}
      {...(isWarm ? { 'data-theme': 'warm' } : {})}
    >
      <body>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
