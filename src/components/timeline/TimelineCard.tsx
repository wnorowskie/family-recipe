import { TimelineItem, getActionText } from '@/lib/timeline';
import ActorHeader from './ActorHeader';
import PostPreview from './PostPreview';

interface TimelineCardProps {
  item: TimelineItem;
}

export default function TimelineCard({ item }: TimelineCardProps) {
  const action = getActionText(item.type);

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
      <ActorHeader
        actor={item.actor}
        action={action}
        timestamp={item.timestamp}
        metadata={getMetadata(item)}
      />
      <PostPreview post={item.post} />
      {renderExtra(item)}
    </div>
  );
}

function getMetadata(item: TimelineItem): string | null {
  switch (item.type) {
    case 'reaction_added':
      return item.reaction?.emoji ?? null;
    case 'cooked_logged':
      if (item.cooked?.rating) {
        return `${item.cooked.rating} ★`;
      }
      return null;
    case 'post_edited':
      return null;
    default:
      return null;
  }
}

function renderExtra(item: TimelineItem) {
  switch (item.type) {
    case 'comment_added':
      return (
        <div className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
          “{item.comment?.text}”
        </div>
      );
    case 'cooked_logged':
      if (!item.cooked?.note) {
        return null;
      }
      return (
        <p className="text-sm text-gray-600">“{item.cooked.note}”</p>
      );
    case 'post_edited':
      if (!item.edit?.note) {
        return null;
      }
      return (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          “{item.edit.note}”
        </div>
      );
    default:
      return null;
  }
}
