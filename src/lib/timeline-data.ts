import { prisma } from '@/lib/prisma';
import type { TimelineItem, TimelineItemType } from '@/lib/timeline';
import { createSignedUrlResolver } from '@/lib/uploads';

const PAGE_SIZE = 20;

interface TimelineQueryInput {
  familySpaceId: string;
  limit?: number;
  offset?: number;
}

interface RawTimelineResult {
  id: string;
  type: TimelineItemType;
  createdAt: Date;
  actorId: string;
  actorName: string;
  actorAvatar: string | null;
  postId: string;
  postTitle: string;
  postPhoto: string | null;
  commentId?: string;
  commentText?: string;
  reactionEmoji?: string;
  cookedRating?: number | null;
  cookedNote?: string | null;
  editNote?: string | null;
}

export async function getTimelineFeed({
  familySpaceId,
  limit = PAGE_SIZE,
  offset = 0,
}: TimelineQueryInput): Promise<{
  items: TimelineItem[];
  hasMore: boolean;
  nextOffset: number;
}> {
  const postEvents = await prisma.post.findMany({
    where: { familySpaceId },
    orderBy: { createdAt: 'desc' },
    take: limit + offset + 5,
    select: {
      id: true,
      title: true,
      mainPhotoStorageKey: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
    },
  });

  const commentEvents = await prisma.comment.findMany({
    where: {
      deletedAt: null,
      post: { familySpaceId },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + offset + 5,
    select: {
      id: true,
      text: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          mainPhotoStorageKey: true,
        },
      },
    },
  });

  const reactionEvents = await prisma.reaction.findMany({
    where: {
      targetType: 'post',
      post: { familySpaceId },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + offset + 5,
    select: {
      id: true,
      emoji: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          mainPhotoStorageKey: true,
        },
      },
    },
  });

  const cookedEvents = await prisma.cookedEvent.findMany({
    where: {
      post: { familySpaceId },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + offset + 5,
    select: {
      id: true,
      rating: true,
      note: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          mainPhotoStorageKey: true,
        },
      },
    },
  });

  const editEvents = await prisma.post.findMany({
    where: {
      familySpaceId,
      lastEditAt: {
        not: null,
      },
    },
    orderBy: {
      lastEditAt: 'desc',
    },
    take: limit + offset + 5,
    select: {
      id: true,
      title: true,
      mainPhotoStorageKey: true,
      createdAt: true,
      lastEditAt: true,
      lastEditNote: true,
      editor: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
    },
  });

  const raw: RawTimelineResult[] = [];

  postEvents.forEach((event: any) =>
    raw.push({
      id: `post-${event.id}`,
      type: 'post_created',
      createdAt: event.createdAt,
      actorId: event.author.id,
      actorName: event.author.name,
      actorAvatar: event.author.avatarStorageKey,
      postId: event.id,
      postTitle: event.title,
      postPhoto: event.mainPhotoStorageKey,
    })
  );

  commentEvents.forEach((event: any) =>
    raw.push({
      id: `comment-${event.id}`,
      type: 'comment_added',
      createdAt: event.createdAt,
      actorId: event.author.id,
      actorName: event.author.name,
      actorAvatar: event.author.avatarStorageKey,
      postId: event.post.id,
      postTitle: event.post.title,
      postPhoto: event.post.mainPhotoStorageKey,
      commentId: event.id,
      commentText: event.text,
    })
  );

  reactionEvents.forEach((event: any) =>
    raw.push({
      id: `reaction-${event.id}`,
      type: 'reaction_added',
      createdAt: event.createdAt,
      actorId: event.user.id,
      actorName: event.user.name,
      actorAvatar: event.user.avatarStorageKey,
      postId: event.post?.id ?? '',
      postTitle: event.post?.title ?? 'A post',
      postPhoto: event.post?.mainPhotoStorageKey ?? null,
      reactionEmoji: event.emoji,
    })
  );

  cookedEvents.forEach((event: any) =>
    raw.push({
      id: `cooked-${event.id}`,
      type: 'cooked_logged',
      createdAt: event.createdAt,
      actorId: event.user.id,
      actorName: event.user.name,
      actorAvatar: event.user.avatarStorageKey,
      postId: event.post.id,
      postTitle: event.post.title,
      postPhoto: event.post.mainPhotoStorageKey,
      cookedRating: event.rating,
      cookedNote: event.note,
    })
  );

  editEvents.forEach((event: any) => {
    if (!event.lastEditAt) {
      return;
    }
    if (event.lastEditAt.getTime() === event.createdAt.getTime()) {
      return;
    }
    const actor = event.editor ?? event.author;
    if (!actor) {
      return;
    }
    // Skip edit events that occurred at creation time
    raw.push({
      id: `edit-${event.id}-${event.lastEditAt.getTime()}`,
      type: 'post_edited',
      createdAt: event.lastEditAt,
      actorId: actor.id,
      actorName: actor.name,
      actorAvatar: actor.avatarStorageKey,
      postId: event.id,
      postTitle: event.title,
      postPhoto: event.mainPhotoStorageKey,
      editNote: event.lastEditNote ?? null,
    });
  });

  raw.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const slice = raw.slice(offset, offset + limit);
  const hasMore = raw.length > offset + limit;

  const resolveUrl = createSignedUrlResolver();
  const filteredEntries = slice.filter((entry) => entry.postId);
  const items: TimelineItem[] = await Promise.all(
    filteredEntries.map(async (entry) => {
      const base = {
        id: entry.id,
        timestamp: entry.createdAt,
        actor: {
          id: entry.actorId,
          name: entry.actorName,
          avatarUrl: await resolveUrl(entry.actorAvatar),
        },
        post: {
          id: entry.postId,
          title: entry.postTitle,
          mainPhotoUrl: await resolveUrl(entry.postPhoto),
        },
      } as const;

      switch (entry.type) {
        case 'post_created':
          return {
            ...base,
            type: 'post_created' as const,
          };
        case 'comment_added':
          return {
            ...base,
            type: 'comment_added' as const,
            comment: {
              id: entry.commentId ?? '',
              text: entry.commentText ?? '',
            },
          };
        case 'reaction_added':
          return {
            ...base,
            type: 'reaction_added' as const,
            reaction: {
              emoji: entry.reactionEmoji ?? '❤️',
            },
          };
        case 'cooked_logged':
          return {
            ...base,
            type: 'cooked_logged' as const,
            cooked: {
              rating: entry.cookedRating ?? null,
              note: entry.cookedNote ?? null,
            },
          };
        case 'post_edited':
          return {
            ...base,
            type: 'post_edited' as const,
            edit: {
              note: entry.editNote ?? null,
            },
          };
        default:
          return {
            ...base,
            type: 'post_created' as const,
          };
      }
    })
  );

  return {
    items,
    hasMore,
    nextOffset: offset + limit,
  };
}
// @ts-nocheck
