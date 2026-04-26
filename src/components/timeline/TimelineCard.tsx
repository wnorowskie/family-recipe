import { ChefHat, FileText, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { formatRelativeTime, getActionText } from '@/lib/timeline';
import type { TimelineItem } from '@/lib/timeline';

interface TimelineCardProps {
  item: TimelineItem;
}

const EVENT_ICON: Partial<Record<TimelineItem['type'], LucideIcon>> = {
  post_created: FileText,
  comment_added: MessageCircle,
  cooked_logged: ChefHat,
};

export default function TimelineCard({ item }: TimelineCardProps) {
  const verb = getActionText(item.type);
  const Icon = EVENT_ICON[item.type];

  return (
    <article className="rounded-card border border-[var(--border-card)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-start gap-3">
        <EventMarker icon={Icon} item={item} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-normal">
            <span className="font-medium text-[var(--fg-strong)]">
              {item.actor.name}
            </span>{' '}
            <span className="text-[var(--fg-meta)]">{verb}</span>{' '}
            <Link
              href={`/posts/${item.post.id}`}
              className="font-medium text-[var(--fg-strong)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-active)]"
            >
              ‘{item.post.title}’
            </Link>
          </p>

          <EventBody item={item} />

          <p className="mt-2 text-xs text-[var(--fg-caption)]">
            {formatRelativeTime(item.timestamp)}
          </p>
        </div>
      </div>
    </article>
  );
}

function EventMarker({
  icon: Icon,
  item,
}: {
  icon: LucideIcon | undefined;
  item: TimelineItem;
}) {
  if (Icon) {
    return (
      <Icon
        size={20}
        aria-hidden="true"
        className="mt-0.5 flex-shrink-0 text-[var(--fg-caption)]"
      />
    );
  }
  if (item.type === 'reaction_added') {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center text-base leading-none"
      >
        {item.reaction.emoji}
      </span>
    );
  }
  return null;
}

function EventBody({ item }: { item: TimelineItem }) {
  switch (item.type) {
    case 'post_created':
      return item.post.mainPhotoUrl ? (
        <div className="relative mt-2 h-32 w-full overflow-hidden rounded-input bg-[var(--color-gray-200)]">
          <Image
            src={item.post.mainPhotoUrl}
            alt={item.post.title}
            fill
            sizes="(min-width: 768px) 600px, 100vw"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null;

    case 'comment_added':
      return (
        <div className="mt-2 rounded-input bg-[var(--bg-muted)] p-3 text-sm text-[var(--fg-body)]">
          “{item.comment.text}”
        </div>
      );

    case 'cooked_logged':
      return (
        <>
          {item.cooked.rating ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="text-sm"
                aria-label={`${item.cooked.rating} ${item.cooked.rating === 1 ? 'star' : 'stars'}`}
              >
                {'⭐'.repeat(item.cooked.rating)}
              </span>
              <span className="text-xs text-[var(--fg-caption)]">
                ({item.cooked.rating}{' '}
                {item.cooked.rating === 1 ? 'star' : 'stars'})
              </span>
            </div>
          ) : null}
          {item.cooked.note ? (
            <div className="mt-2 rounded-input bg-[var(--bg-muted)] p-3 text-sm text-[var(--fg-body)]">
              “{item.cooked.note}”
            </div>
          ) : null}
        </>
      );

    case 'reaction_added':
      return null;
  }
}
