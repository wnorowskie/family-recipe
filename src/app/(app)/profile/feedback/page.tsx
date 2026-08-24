import { redirect } from 'next/navigation';
import AdminFeedbackList from '@/components/profile/AdminFeedbackList';
import { resolvePageUser } from '@/lib/session';
import { getFeedbackForFamily } from '@/lib/feedback';

const INITIAL_LIMIT = 20;

export default async function FeedbackAdminPage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const isAdmin = user.role === 'owner' || user.role === 'admin';
  if (!isAdmin) {
    redirect('/profile');
  }

  const page = await getFeedbackForFamily(user.familySpaceId, {
    limit: INITIAL_LIMIT,
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--fg-caption)]">
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-[var(--fg-strong)]">
          Feedback inbox
        </h2>
        <p className="text-sm text-[var(--fg-caption)]">
          Bugs and suggestions submitted by your family. Logs are emitted on
          submission for alerting.
        </p>
      </div>

      <AdminFeedbackList
        initialItems={page.items}
        initialHasMore={page.hasMore}
        initialNextOffset={page.nextOffset}
      />
    </section>
  );
}
