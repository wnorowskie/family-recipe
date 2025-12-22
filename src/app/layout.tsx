import type { Metadata } from 'next';
import './globals.css';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';

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
    <html lang="en">
      <body>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
