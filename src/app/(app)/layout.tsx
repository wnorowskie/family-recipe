import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import BottomNav from '@/components/navigation/BottomNav';
import { getCurrentUser } from '@/lib/session';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');

  if (!sessionCookie) {
    redirect('/login');
  }

  const mockRequest = {
    cookies: {
      get: () => sessionCookie,
    },
  } as any;

  const user = await getCurrentUser(mockRequest);

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {user.familySpaceName}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">Family Recipe</h1>
            <p className="text-sm text-gray-500">Hi {user.name.split(' ')[0]}!</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/timeline"
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Timeline
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto mt-4 max-w-3xl px-4 pb-10">{children}</main>
      <BottomNav />
    </div>
  );
}
