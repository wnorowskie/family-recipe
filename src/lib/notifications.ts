import { prisma } from './prisma';
import { createSignedUrlResolver } from './uploads';

export type NotificationType = 'comment' | 'reaction_batch' | 'cooked';

export interface ReactionEmojiCount {
  emoji: string;
  count: number;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  post: {
    id: string;
    title: string;
    mainPhotoUrl: string | null;
  };
  commentText?: string | null;
  cookedNote?: string | null;
  cookedRating?: number | null;
  reactionSummary?: {
    totalCount: number;
    emojiCounts: ReactionEmojiCount[];
    lastEmoji?: string;
  };
}

type CommentMetadata = { commentText?: string };
type CookedMetadata = { note?: string | null; rating?: number | null };
type ReactionMetadata = { lastEmoji?: string };

function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function serializeJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export function aggregateEmojiCounts(
  reactions: Array<{ emoji: string }>
): ReactionEmojiCount[] {
  const map = new Map<string, number>();
  reactions.forEach((reaction) => {
    map.set(reaction.emoji, (map.get(reaction.emoji) ?? 0) + 1);
  });
  return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
}

export async function createCommentNotification(options: {
  familySpaceId: string;
  postId: string;
  recipientId: string;
  actorId: string;
  commentId: string;
  commentText?: string;
}) {
  const {
    familySpaceId,
    postId,
    recipientId,
    actorId,
    commentId,
    commentText,
  } = options;

  if (recipientId === actorId) return;

  await prisma.notification.create({
    data: {
      familySpaceId,
      postId,
      recipientId,
      actorId,
      type: 'comment',
      commentId,
      metadataJson: serializeJson({ commentText }),
    },
  });
}

export async function createCookedNotification(options: {
  familySpaceId: string;
  postId: string;
  recipientId: string;
  actorId: string;
  cookedEventId: string;
  note?: string | null;
  rating?: number | null;
}) {
  const {
    familySpaceId,
    postId,
    recipientId,
    actorId,
    cookedEventId,
    note,
    rating,
  } = options;

  if (recipientId === actorId) return;

  await prisma.notification.create({
    data: {
      familySpaceId,
      postId,
      recipientId,
      actorId,
      type: 'cooked',
      cookedEventId,
      metadataJson: serializeJson({ note, rating }),
    },
  });
}

export async function upsertReactionNotification(options: {
  familySpaceId: string;
  postId: string;
  recipientId: string;
  actorId: string;
}) {
  const { familySpaceId, postId, recipientId, actorId } = options;

  if (recipientId === actorId) return;

  const reactions = await prisma.reaction.findMany({
    where: {
      postId,
      post: { familySpaceId },
      userId: { not: recipientId },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      emoji: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
    },
  });

  if (reactions.length === 0) {
    await prisma.notification.deleteMany({
      where: {
        recipientId,
        postId,
        type: 'reaction_batch',
        readAt: null,
      },
    });
    return;
  }

  const emojiCounts = aggregateEmojiCounts(reactions);
  const totalCount = reactions.length;
  const latestReaction = reactions[reactions.length - 1];

  const existing = await prisma.notification.findFirst({
    where: {
      recipientId,
      postId,
      type: 'reaction_batch',
      readAt: null,
    },
  });

  const payload = {
    familySpaceId,
    postId,
    recipientId,
    actorId: latestReaction.user.id,
    type: 'reaction_batch',
    totalCount,
    emojiCountsJson: serializeJson(emojiCounts),
    metadataJson: serializeJson({ lastEmoji: latestReaction.emoji }),
  };

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        actorId: payload.actorId,
        totalCount: payload.totalCount,
        emojiCountsJson: payload.emojiCountsJson,
        metadataJson: payload.metadataJson,
        readAt: null,
      },
    });
    return;
  }

  await prisma.notification.create({ data: payload });
}

export async function markNotificationsRead(
  recipientId: string,
  ids?: string[]
) {
  if (ids && ids.length > 0) {
    await prisma.notification.updateMany({
      where: {
        recipientId,
        id: { in: ids },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return;
  }

  await prisma.notification.updateMany({
    where: {
      recipientId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

export async function fetchNotifications(options: {
  recipientId: string;
  familySpaceId: string;
  limit: number;
  offset: number;
}): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset: number;
}> {
  const { recipientId, familySpaceId, limit, offset } = options;

  const unreadCountPromise = prisma.notification.count({
    where: {
      recipientId,
      readAt: null,
    },
  });

  const rows = await prisma.notification.findMany({
    where: {
      recipientId,
      familySpaceId,
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
    skip: offset,
    include: {
      actor: {
        select: { id: true, name: true, avatarStorageKey: true },
      },
      post: {
        select: { id: true, title: true, mainPhotoStorageKey: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);
  const resolveUrl = createSignedUrlResolver();

  const notifications: NotificationItem[] = await Promise.all(
    slice.map(async (row: any) => {
      const reactionMeta = safeParseJson<ReactionMetadata>(row.metadataJson);
      const cookedMeta = safeParseJson<CookedMetadata>(row.metadataJson);
      const commentMeta = safeParseJson<CommentMetadata>(row.metadataJson);
      const emojiCounts =
        safeParseJson<ReactionEmojiCount[]>(row.emojiCountsJson) ?? [];

      return {
        id: row.id,
        type: row.type as NotificationType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        readAt: row.readAt,
        actor: {
          id: row.actor.id,
          name: row.actor.name,
          avatarUrl: await resolveUrl(row.actor.avatarStorageKey),
        },
        post: {
          id: row.post.id,
          title: row.post.title,
          mainPhotoUrl: await resolveUrl(row.post.mainPhotoStorageKey),
        },
        commentText: commentMeta?.commentText,
        cookedNote: cookedMeta?.note ?? null,
        cookedRating:
          typeof cookedMeta?.rating === 'number' ? cookedMeta.rating : null,
        reactionSummary:
          row.type === 'reaction_batch'
            ? {
                totalCount:
                  row.totalCount ??
                  emojiCounts.reduce((sum, c) => sum + c.count, 0),
                emojiCounts,
                lastEmoji: reactionMeta?.lastEmoji,
              }
            : undefined,
      };
    })
  );

  const unreadCount = await unreadCountPromise;

  return {
    notifications,
    unreadCount,
    hasMore,
    nextOffset: offset + notifications.length,
  };
}
