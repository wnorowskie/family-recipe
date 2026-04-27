import type { Metadata } from 'next';
import localFont from 'next/font/local';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
