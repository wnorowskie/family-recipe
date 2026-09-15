import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import './globals.css';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';

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
};

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
