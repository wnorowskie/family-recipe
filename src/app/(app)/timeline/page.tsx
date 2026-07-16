import { redirect } from 'next/navigation';
import TimelineFeed from '@/components/timeline/TimelineFeed';
import { resolvePageUser } from '@/lib/session';
import { getTimelineFeed } from '@/lib/timeline-data';
import type { TimelineItem } from '@/lib/timeline';

const PAGE_SIZE = 20;

export default async function TimelinePage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const { items, hasMore, nextOffset } = await getTimelineFeed({
    familySpaceId: user.familySpaceId,
    limit: PAGE_SIZE,
    offset: 0,
  });

  // Normalize Date fields to ISO strings so initial items match the shape of
  // paginated items returned by /api/timeline.
  const initialItems = JSON.parse(JSON.stringify(items)) as TimelineItem[];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Family Timeline</h2>
        <p className="text-sm text-gray-500">
          See what everyone has been cooking.
        </p>
      </div>
      <TimelineFeed
        initialItems={initialItems}
        initialHasMore={hasMore}
        initialNextOffset={nextOffset}
      />
    </section>
  );
}
