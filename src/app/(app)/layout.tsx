import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthBootstrap from '@/components/AuthBootstrap';
import LogoutButton from '@/components/LogoutButton';
import BottomNav from '@/components/navigation/BottomNav';
import NotificationBell from '@/components/navigation/NotificationBell';
import { fetchSessionUser } from '@/lib/auth/bootstrapFromCookies';
import { isFastApiAuthEnabled } from '@/lib/featureFlags';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isFastApiAuthEnabled()) {
    // SSR fetches the user via /v1/auth/session — non-rotating, replay-safe.
    // The chain only advances when the client-side <AuthBootstrap> calls
    // /api/auth/bootstrap on mount, which is a route handler that can
    // propagate the rotated cookies back to the browser. See issue #173.
    const headerStore = await headers();
    const cookieHeader = headerStore.get('cookie');
    const result = await fetchSessionUser(cookieHeader);

    if (!result.ok) {
      redirect('/login');
    }

    // Notifications still read directly from Prisma in Phase 2 — see issue #171
    // for the follow-up to move this onto a /v1 FastAPI endpoint.
    const initialUnreadCount = await prisma.notification.count({
      where: { recipientId: result.user.id, readAt: null },
    });

    return (
      <AuthBootstrap>
        <div className="min-h-screen bg-gray-50 pb-24">
          <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-3xl lg:max-w-2xl items-center justify-between px-4 py-4 gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Wnorowski Family Recipe
                </h1>
                <p className="text-sm text-gray-500">
                  Hi {result.user.name.split(' ')[0]}!
                </p>
              </div>
              <div className="flex items-center gap-3">
                <NotificationBell initialCount={initialUnreadCount} />
                <LogoutButton />
              </div>
            </div>
          </header>
          <main className="mx-auto mt-4 max-w-3xl lg:max-w-2xl px-4 pb-10">
            {children}
          </main>
          <BottomNav />
        </div>
      </AuthBootstrap>
    );
  }

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

  const initialUnreadCount = await prisma.notification.count({
    where: { recipientId: user.id, readAt: null },
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl lg:max-w-2xl items-center justify-between px-4 py-4 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Wnorowski Family Recipe
            </h1>
            <p className="text-sm text-gray-500">
              Hi {user.name.split(' ')[0]}!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell initialCount={initialUnreadCount} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto mt-4 max-w-3xl lg:max-w-2xl px-4 pb-10">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
