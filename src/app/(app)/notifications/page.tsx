import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NotificationsFeed, {
  type NotificationResponseItem,
} from '@/components/notifications/NotificationsFeed';
import { getCurrentUser } from '@/lib/session';
import { fetchNotifications } from '@/lib/notifications';

const PAGE_SIZE = 20;

export default async function NotificationsPage() {
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

  const { notifications, hasMore, nextOffset } = await fetchNotifications({
    recipientId: user.id,
    familySpaceId: user.familySpaceId,
    limit: PAGE_SIZE,
    offset: 0,
  });

  const initialNotifications: NotificationResponseItem[] = notifications.map(
    (notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
    })
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        <p className="text-sm text-gray-500">
          Stay on top of comments, reactions, and cooks on your posts.
        </p>
      </div>
      <NotificationsFeed
        initialNotifications={initialNotifications}
        initialHasMore={hasMore}
        initialNextOffset={nextOffset}
      />
    </section>
  );
}
