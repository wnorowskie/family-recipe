import NotificationsFeed from '@/components/notifications/NotificationsFeed';

export default function NotificationsPage() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        <p className="text-sm text-gray-500">
          Stay on top of comments, reactions, and cooks on your posts.
        </p>
      </div>
      <NotificationsFeed />
    </section>
  );
}
