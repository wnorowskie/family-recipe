import Image from 'next/image';
import PostPreview from '@/components/timeline/PostPreview';
import { formatRelativeTime } from '@/lib/timeline';
import type { NotificationResponseItem } from './NotificationsFeed';

function NotificationAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-blue-500 text-sm font-semibold text-white">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name}
          width={44}
          height={44}
          className="h-11 w-11 object-cover"
          unoptimized
        />
      ) : (
        <span>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

function ReactionSummary({
  reactionSummary,
}: {
  reactionSummary: NonNullable<NotificationResponseItem['reactionSummary']>;
}) {
  if (!reactionSummary) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {reactionSummary.emojiCounts.map((entry) => (
        <span
          key={entry.emoji}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800"
        >
          <span aria-hidden>{entry.emoji}</span>
          <span>{entry.count}</span>
        </span>
      ))}
      <span className="text-xs text-gray-500">
        {reactionSummary.totalCount} total reaction
        {reactionSummary.totalCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function getTitle(notification: NotificationResponseItem): string {
  switch (notification.type) {
    case 'comment':
      return `${notification.actor.name} commented on your post`;
    case 'reaction_batch': {
      const total = notification.reactionSummary?.totalCount ?? 0;
      if (total > 1) {
        return `${notification.actor.name} and ${total - 1} others reacted to your post`;
      }
      return `${notification.actor.name} reacted to your post`;
    }
    case 'cooked':
      return `${notification.actor.name} cooked your recipe`;
    default:
      return `${notification.actor.name} left a notification`;
  }
}

function renderBody(notification: NotificationResponseItem) {
  if (notification.type === 'comment' && notification.commentText) {
    return (
      <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
        “{notification.commentText}”
      </p>
    );
  }

  if (notification.type === 'cooked') {
    return (
      <div className="space-y-2">
        {typeof notification.cookedRating === 'number' && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
            {notification.cookedRating} ★ rating
          </span>
        )}
        {notification.cookedNote && (
          <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
            “{notification.cookedNote}”
          </p>
        )}
      </div>
    );
  }

  if (notification.type === 'reaction_batch' && notification.reactionSummary) {
    return <ReactionSummary reactionSummary={notification.reactionSummary} />;
  }

  return null;
}

export default function NotificationCard({
  notification,
}: {
  notification: NotificationResponseItem;
}) {
  const timestamp = new Date(notification.updatedAt ?? notification.createdAt);
  const unread = !notification.readAt;

  return (
    <div
      className={`space-y-3 rounded-2xl bg-white p-4 shadow-sm ${
        unread ? 'ring-1 ring-blue-100' : 'border border-gray-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <NotificationAvatar
          name={notification.actor.name}
          avatarUrl={notification.actor.avatarUrl}
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">
                {getTitle(notification)}
              </p>
              <p className="text-xs text-gray-500">
                {formatRelativeTime(timestamp)}
              </p>
            </div>
            {unread && (
              <span
                className="mt-1 h-2 w-2 rounded-full bg-blue-500"
                aria-hidden
              />
            )}
          </div>
          {renderBody(notification)}
        </div>
      </div>
      <PostPreview post={notification.post} />
    </div>
  );
}
