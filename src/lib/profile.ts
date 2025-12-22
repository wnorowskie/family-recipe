import { prisma } from '@/lib/prisma';
import { createSignedUrlResolver } from '@/lib/uploads';

const DEFAULT_LIMIT = 10;

export interface ProfilePostListItem {
  id: string;
  title: string;
  mainPhotoUrl: string | null;
  createdAt: string;
  cookedStats: {
    timesCooked: number;
    averageRating: number | null;
  };
}

export interface ProfileCookedItem {
  id: string;
  createdAt: string;
  rating: number | null;
  note: string | null;
  post: {
    id: string;
    title: string;
    mainPhotoUrl: string | null;
  };
}

export interface ProfileFavoriteItem {
  id: string;
  createdAt: string;
  post: {
    id: string;
    title: string;
    mainPhotoUrl: string | null;
    authorName: string;
  };
}

interface PaginationArgs {
  limit?: number;
  offset?: number;
}

export async function getUserPostsForProfile(
  userId: string,
  familySpaceId: string,
  { limit = DEFAULT_LIMIT, offset = 0 }: PaginationArgs = {}
) {
  const posts = await prisma.post.findMany({
    where: {
      authorId: userId,
      familySpaceId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    skip: offset,
  });

  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;
  const postIds = slice.map((post) => post.id);

  let cookedStatsMap: Record<
    string,
    { timesCooked: number; averageRating: number | null }
  > = {};

  if (postIds.length > 0) {
    const cookedGroups = await prisma.cookedEvent.groupBy({
      where: {
        postId: { in: postIds },
      },
      by: ['postId'],
      _count: {
        _all: true,
      },
      _avg: {
        rating: true,
      },
    });

    cookedStatsMap = cookedGroups.reduce<
      Record<string, { timesCooked: number; averageRating: number | null }>
    >((acc, group) => {
      acc[group.postId] = {
        timesCooked: group._count._all,
        averageRating: group._avg.rating,
      };
      return acc;
    }, {});
  }

  const resolveUrl = createSignedUrlResolver();
  const items: ProfilePostListItem[] = await Promise.all(
    slice.map(async (post) => {
      const stats = cookedStatsMap[post.id] ?? {
        timesCooked: 0,
        averageRating: null,
      };
      return {
        id: post.id,
        title: post.title,
        mainPhotoUrl: await resolveUrl(post.mainPhotoStorageKey),
        createdAt: post.createdAt.toISOString(),
        cookedStats: stats,
      };
    })
  );

  return {
    items,
    hasMore,
    nextOffset: offset + limit,
  };
}

export async function getUserCookedHistory(
  userId: string,
  familySpaceId: string,
  { limit = DEFAULT_LIMIT, offset = 0 }: PaginationArgs = {}
) {
  const cookedEvents = await prisma.cookedEvent.findMany({
    where: {
      userId,
      post: {
        familySpaceId,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    skip: offset,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          mainPhotoStorageKey: true,
        },
      },
    },
  });

  const hasMore = cookedEvents.length > limit;
  const slice = hasMore ? cookedEvents.slice(0, limit) : cookedEvents;

  const resolveUrl = createSignedUrlResolver();
  const items: ProfileCookedItem[] = await Promise.all(
    slice.map(async (entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      rating: entry.rating,
      note: entry.note,
      post: {
        id: entry.post.id,
        title: entry.post.title,
        mainPhotoUrl: await resolveUrl(entry.post.mainPhotoStorageKey),
      },
    }))
  );

  return {
    items,
    hasMore,
    nextOffset: offset + limit,
  };
}

export async function getUserFavorites(
  userId: string,
  familySpaceId: string,
  { limit = DEFAULT_LIMIT, offset = 0 }: PaginationArgs = {}
) {
  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      post: {
        familySpaceId,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    skip: offset,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          mainPhotoStorageKey: true,
          author: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const hasMore = favorites.length > limit;
  const slice = hasMore ? favorites.slice(0, limit) : favorites;

  const resolveUrl = createSignedUrlResolver();
  const items: ProfileFavoriteItem[] = await Promise.all(
    slice.map(async (favorite) => ({
      id: favorite.id,
      createdAt: favorite.createdAt.toISOString(),
      post: {
        id: favorite.post.id,
        title: favorite.post.title,
        mainPhotoUrl: await resolveUrl(favorite.post.mainPhotoStorageKey),
        authorName: favorite.post.author.name,
      },
    }))
  );

  return {
    items,
    hasMore,
    nextOffset: offset + limit,
  };
}
