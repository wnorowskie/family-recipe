import { redirect } from 'next/navigation';
import NotificationsFeed, {
  type NotificationResponseItem,
} from '@/components/notifications/NotificationsFeed';
import { resolvePageUser } from '@/lib/session';
import { fetchNotifications } from '@/lib/notifications';

const PAGE_SIZE = 20;

export default async function NotificationsPage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
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
        <h2 className="text-xl font-semibold text-[var(--fg-strong)]">
          Notifications
        </h2>
        <p className="text-sm text-[var(--fg-caption)]">
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
