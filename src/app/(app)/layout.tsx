import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthBootstrap from '@/components/AuthBootstrap';
import LogoutButton from '@/components/LogoutButton';
import BottomNav from '@/components/navigation/BottomNav';
import NotificationBell from '@/components/navigation/NotificationBell';
import { type AuthUser } from '@/lib/authStore';
import { isFastApiAuthEnabled } from '@/lib/featureFlags';
import { logError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

interface BootstrapPayload {
  accessToken: string;
  user: AuthUser;
}

async function fetchBootstrap(
  cookieHeader: string,
  baseUrl: string
): Promise<BootstrapPayload | null> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as BootstrapPayload;
  } catch (error) {
    logError('app.layout.bootstrap', error);
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isFastApiAuthEnabled()) {
    const headerStore = await headers();
    const cookieHeader = headerStore.get('cookie') ?? '';
    const host = headerStore.get('host') ?? 'localhost:3000';
    const protocol =
      headerStore.get('x-forwarded-proto') ??
      (host.startsWith('localhost') ? 'http' : 'https');

    const bootstrap = await fetchBootstrap(
      cookieHeader,
      `${protocol}://${host}`
    );
    if (!bootstrap) {
      redirect('/login');
    }

    // Notifications still read directly from Prisma in Phase 2 — see issue #171
    // for the follow-up to move this onto a /v1 FastAPI endpoint.
    const initialUnreadCount = await prisma.notification.count({
      where: { recipientId: bootstrap.user.id, readAt: null },
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
                  Hi {bootstrap.user.name.split(' ')[0]}!
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
