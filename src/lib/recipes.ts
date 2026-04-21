import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

import { courseEnum } from '@/lib/validation';
import { createSignedUrlResolver } from '@/lib/uploads';

const COURSE_VALUES = new Set(courseEnum.options);
const DIFFICULTY_VALUES = new Set(['easy', 'medium', 'hard']);

function parseCourses(
  value: string | null,
  fallback?: string | null
): string[] {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (entry): entry is string =>
            typeof entry === 'string' &&
            COURSE_VALUES.has(entry as (typeof courseEnum.options)[number])
        );
        if (filtered.length > 0) {
          return Array.from(new Set(filtered));
        }
      }
    } catch {
      // Ignore invalid JSON strings
    }
  }

  if (
    fallback &&
    COURSE_VALUES.has(fallback as (typeof courseEnum.options)[number])
  ) {
    return [fallback];
  }

  return [];
}

export interface RecipeListItem {
  id: string;
  title: string;
  mainPhotoUrl: string | null;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  courses: string[];
  primaryCourse: string | null;
  difficulty: string | null;
  tags: string[];
  totalTime: number | null;
  servings: number | null;
  cookedStats: {
    timesCooked: number;
    averageRating: number | null;
  };
}

export interface RecipeQueryInput {
  familySpaceId: string;
  limit: number;
  offset: number;
  search?: string;
  authorIds?: string[];
  courses?: string[];
  tags?: string[];
  difficulties?: string[];
  minTotalMinutes?: number;
  maxTotalMinutes?: number;
  minServings?: number;
  maxServings?: number;
  ingredients?: string[];
  sort?: 'recent' | 'alpha' | 'rating';
}

export interface RecipeQueryResult {
  items: RecipeListItem[];
  hasMore: boolean;
  nextOffset: number;
}

export async function getRecipes(
  input: RecipeQueryInput
): Promise<RecipeQueryResult> {
  const {
    familySpaceId,
    limit,
    offset,
    search,
    authorIds = [],
    courses = [],
    tags = [],
    difficulties = [],
    minTotalMinutes,
    maxTotalMinutes,
    minServings,
    maxServings,
    ingredients = [],
    sort = 'recent',
  } = input;

  const where: Prisma.PostWhereInput = {
    familySpaceId,
    hasRecipeDetails: true,
  };

  const andFilters: Prisma.PostWhereInput[] = [];

  if (search) {
    const searchValue = search.trim();
    if (searchValue.length > 0) {
      andFilters.push({
        title: {
          contains: searchValue,
          mode: 'insensitive',
        },
      });
    }
  }

  const normalizedAuthorIds = Array.from(
    new Set(
      authorIds
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)
    )
  );

  if (normalizedAuthorIds.length > 0) {
    andFilters.push({
      authorId: {
        in: normalizedAuthorIds,
      },
    });
  }

  const normalizedCourses = Array.from(
    new Set(
      courses.filter(
        (value): value is string =>
          typeof value === 'string' &&
          COURSE_VALUES.has(value as (typeof courseEnum.options)[number])
      )
    )
  );

  if (normalizedCourses.length > 0) {
    const courseFilters: Prisma.PostWhereInput[] = normalizedCourses.map(
      (value) => ({
        recipeDetails: {
          is: {
            OR: [
              { course: value },
              {
                courses: {
                  contains: JSON.stringify(value),
                  mode: 'insensitive',
                },
              },
            ],
          },
        },
      })
    );

    andFilters.push({ OR: courseFilters });
  }

  if (tags.length > 0) {
    tags.forEach((tagName) => {
      andFilters.push({
        tags: {
          some: {
            tag: {
              name: tagName,
            },
          },
        },
      });
    });
  }

  const normalizedDifficulties = Array.from(
    new Set(
      difficulties.filter(
        (value): value is string =>
          typeof value === 'string' && DIFFICULTY_VALUES.has(value)
      )
    )
  );

  if (normalizedDifficulties.length > 0) {
    andFilters.push({
      recipeDetails: {
        is: {
          difficulty: {
            in: normalizedDifficulties,
          },
        },
      },
    });
  }

  if (
    typeof minTotalMinutes === 'number' ||
    typeof maxTotalMinutes === 'number'
  ) {
    const totalTimeFilter: Prisma.IntFilter = {};
    if (typeof minTotalMinutes === 'number') {
      totalTimeFilter.gte = minTotalMinutes;
    }
    if (typeof maxTotalMinutes === 'number') {
      totalTimeFilter.lte = maxTotalMinutes;
    }

    andFilters.push({
      recipeDetails: {
        is: {
          totalTime: totalTimeFilter,
        },
      },
    });
  }

  if (typeof minServings === 'number' || typeof maxServings === 'number') {
    const servingsFilter: Prisma.IntFilter = {};
    if (typeof minServings === 'number') {
      servingsFilter.gte = minServings;
    }
    if (typeof maxServings === 'number') {
      servingsFilter.lte = maxServings;
    }

    andFilters.push({
      recipeDetails: {
        is: {
          servings: servingsFilter,
        },
      },
    });
  }

  if (ingredients.length > 0) {
    ingredients.forEach((keyword) => {
      andFilters.push({
        recipeDetails: {
          is: {
            ingredients: {
              contains: keyword,
            },
          },
        },
      });
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  const orderBy =
    sort === 'alpha'
      ? [
          {
            title: 'asc' as const,
          },
          {
            createdAt: 'desc' as const,
          },
        ]
      : [{ createdAt: 'desc' as const }];

  const baseQuery = {
    where,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          avatarStorageKey: true,
        },
      },
      recipeDetails: true,
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy,
  } satisfies Prisma.PostFindManyArgs;
  type RecipePost = Prisma.PostGetPayload<typeof baseQuery>;

  async function fetchCookedStats(
    ids: string[]
  ): Promise<
    Record<string, { timesCooked: number; averageRating: number | null }>
  > {
    if (ids.length === 0) return {};
    const cookedGroups = await prisma.cookedEvent.groupBy({
      where: { postId: { in: ids } },
      by: ['postId'],
      _count: { _all: true },
      _avg: { rating: true },
    });
    return (cookedGroups as any[]).reduce(
      (acc, group: any) => {
        acc[group.postId] = {
          timesCooked: group._count._all,
          averageRating: group._avg.rating,
        };
        return acc;
      },
      {} as Record<
        string,
        { timesCooked: number; averageRating: number | null }
      >
    );
  }

  let slice: RecipePost[];
  let hasMore: boolean;
  let cookedStatsMap: Record<
    string,
    { timesCooked: number; averageRating: number | null }
  >;

  if (sort === 'rating') {
    // Rating sort joins against an aggregate from CookedEvent that Prisma
    // cannot express in a single orderBy. Fetch all matching posts, compute
    // stats, sort in memory, then paginate. Safe at V1 scale (one family).
    const allPosts = (await prisma.post.findMany(baseQuery)) as RecipePost[];
    cookedStatsMap = await fetchCookedStats(allPosts.map((p) => p.id));
    const sorted = [...allPosts].sort((a, b) => {
      const statsA = cookedStatsMap[a.id];
      const statsB = cookedStatsMap[b.id];
      const avgA = statsA?.averageRating ?? null;
      const avgB = statsB?.averageRating ?? null;
      // Unrated posts always sink below rated ones.
      if (avgA === null && avgB !== null) return 1;
      if (avgA !== null && avgB === null) return -1;
      if (avgA !== null && avgB !== null && avgA !== avgB) {
        return avgB - avgA;
      }
      const cookedA = statsA?.timesCooked ?? 0;
      const cookedB = statsB?.timesCooked ?? 0;
      if (cookedA !== cookedB) return cookedB - cookedA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    hasMore = sorted.length > offset + limit;
    slice = sorted.slice(offset, offset + limit);
  } else {
    const posts = (await prisma.post.findMany({
      ...baseQuery,
      take: limit + 1,
      skip: offset,
    })) as RecipePost[];
    hasMore = posts.length > limit;
    slice = hasMore ? posts.slice(0, limit) : posts;
    cookedStatsMap = await fetchCookedStats(slice.map((p) => p.id));
  }

  const resolveUrl = createSignedUrlResolver();
  const items: RecipeListItem[] = await Promise.all(
    slice.map(async (post: any) => {
      const stats = cookedStatsMap[post.id] ?? {
        timesCooked: 0,
        averageRating: null,
      };
      const courses = parseCourses(
        post.recipeDetails?.courses ?? null,
        post.recipeDetails?.course ?? null
      );
      return {
        id: post.id,
        title: post.title,
        mainPhotoUrl: await resolveUrl(post.mainPhotoStorageKey),
        author: {
          id: post.author.id,
          name: post.author.name,
          avatarUrl: await resolveUrl(post.author.avatarStorageKey),
        },
        courses,
        primaryCourse: courses[0] ?? null,
        difficulty: post.recipeDetails?.difficulty ?? null,
        tags: post.tags.map((entry: any) => entry.tag.name),
        totalTime: post.recipeDetails?.totalTime ?? null,
        servings: post.recipeDetails?.servings ?? null,
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
