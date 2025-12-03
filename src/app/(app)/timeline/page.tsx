import TimelineFeed from '@/components/timeline/TimelineFeed';

export default async function TimelinePage() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Family Timeline</h2>
        <p className="text-sm text-gray-500">See what everyone has been cooking.</p>
      </div>
      <TimelineFeed />
    </section>
  );
}
