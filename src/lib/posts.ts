import { prisma } from '@/lib/prisma';
import {
  ingredientUnitEnum,
  courseEnum,
  type RecipeIngredientInput,
  type RecipeStepInput,
} from '@/lib/validation';

const INGREDIENT_UNITS = new Set(ingredientUnitEnum.options);
const COURSE_VALUES = new Set(courseEnum.options);

function parseJsonArray(value: string | null): unknown[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRecipeIngredients(
  value: string | null
): RecipeIngredientInput[] {
  const results: RecipeIngredientInput[] = [];
  
  for (const entry of parseJsonArray(value)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const { name, unit, quantity } = entry as Record<string, unknown>;

    if (typeof name !== 'string' || typeof unit !== 'string') {
      continue;
    }

    if (!INGREDIENT_UNITS.has(unit as typeof ingredientUnitEnum.options[number])) {
      continue;
    }

    let parsedQuantity: number | null | undefined = undefined;
    if (typeof quantity === 'number' && Number.isFinite(quantity)) {
      parsedQuantity = quantity;
    } else if (quantity === null) {
      parsedQuantity = null;
    }

    results.push({
      name,
      unit: unit as RecipeIngredientInput['unit'],
      quantity: parsedQuantity,
    });
  }
  
  return results;
}

function parseRecipeSteps(value: string | null): RecipeStepInput[] {
  return parseJsonArray(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const { text } = entry as Record<string, unknown>;

      if (typeof text !== 'string') {
        return null;
      }

      return { text } satisfies RecipeStepInput;
    })
    .filter((entry): entry is RecipeStepInput => Boolean(entry));
}

function parseCourseList(
  value: string | null,
  fallback?: string | null
): string[] {
  const parsed = parseJsonArray(value).filter(
    (entry): entry is string => typeof entry === 'string' && COURSE_VALUES.has(entry as typeof courseEnum.options[number])
  );

  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }

  if (fallback && COURSE_VALUES.has(fallback as typeof courseEnum.options[number])) {
    return [fallback];
  }

  return [];
}

interface ReactionUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PostDetailComment {
  id: string;
  text: string;
  photoUrl: string | null;
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  reactions: Array<{
    emoji: string;
    count: number;
    users: ReactionUserSummary[];
  }>;
}

export interface PostCookedEntry {
  id: string;
  rating: number | null;
  note: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface PostDetailData {
  id: string;
  title: string;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  mainPhotoUrl: string | null;
  isFavorited: boolean;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  editor: {
    id: string;
    name: string;
  } | null;
  lastEditNote: string | null;
  lastEditAt: string | null;
  photos: Array<{
    id: string;
    url: string;
  }>;
  recipe:
    | {
        origin: string | null;
        ingredients: RecipeIngredientInput[];
        steps: RecipeStepInput[];
        totalTime: number | null;
        servings: number | null;
        courses: string[];
        primaryCourse: string | null;
        difficulty: string | null;
      }
    | null;
  tags: string[];
  reactionSummary: Array<{
    emoji: string;
    count: number;
    users: ReactionUserSummary[];
  }>;
  cookedStats: {
    timesCooked: number;
    averageRating: number | null;
  };
  comments: PostDetailComment[];
  commentsPage: {
    hasMore: boolean;
    nextOffset: number;
  };
  recentCooked: PostCookedEntry[];
  recentCookedPage: {
    hasMore: boolean;
    nextOffset: number;
  };
}

const COMMENT_DEFAULT_LIMIT = 20;
const COMMENT_MAX_LIMIT = 50;
const COOKED_DEFAULT_LIMIT = 5;
const COOKED_MAX_LIMIT = 50;

interface CommentPageOptions {
  postId: string;
  familySpaceId: string;
  limit?: number;
  offset?: number;
}

export interface CommentPageResult {
  comments: PostDetailComment[];
  hasMore: boolean;
  nextOffset: number;
}

interface CookedPageOptions {
  postId: string;
  familySpaceId: string;
  limit?: number;
  offset?: number;
}

export interface CookedPageResult {
  entries: PostCookedEntry[];
  hasMore: boolean;
  nextOffset: number;
}

export interface PostDetailOptions {
  commentLimit?: number;
  commentOffset?: number;
  cookedLimit?: number;
  cookedOffset?: number;
}

export async function getPostDetail(
  postId: string,
  familySpaceId: string,
  currentUserId?: string,
  options: PostDetailOptions = {}
): Promise<PostDetailData | null> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      familySpaceId,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      editor: {
        select: {
          id: true,
          name: true,
        },
      },
      photos: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          url: true,
        },
      },
      recipeDetails: true,
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!post) {
    return null;
  }

  let isFavorited = false;

  if (currentUserId) {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_postId: {
          userId: currentUserId,
          postId,
        },
      },
    });

    isFavorited = Boolean(favorite);
  }

  const [commentPage, cookedPage, postReactions, cookedAggregate] = await Promise.all([
    getPostCommentsPage({
      postId,
      familySpaceId,
      limit: options.commentLimit ?? COMMENT_DEFAULT_LIMIT,
      offset: options.commentOffset ?? 0,
    }),
    getPostCookedEventsPage({
      postId,
      familySpaceId,
      limit: options.cookedLimit ?? COOKED_DEFAULT_LIMIT,
      offset: options.cookedOffset ?? 0,
    }),
    prisma.reaction.findMany({
      where: {
        targetType: 'post',
        targetId: postId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.cookedEvent.aggregate({
      where: {
        postId,
      },
      _count: {
        _all: true,
      },
      _avg: {
        rating: true,
      },
    }),
  ]);

  const reactionSummaryMap = postReactions.reduce<Map<string, { count: number; users: ReactionUserSummary[] }>>(
    (acc, reaction) => {
      const entry = acc.get(reaction.emoji) ?? { count: 0, users: [] };
      entry.count += 1;
      entry.users.push({
        id: reaction.user.id,
        name: reaction.user.name,
        avatarUrl: reaction.user.avatarUrl,
      });
      acc.set(reaction.emoji, entry);
      return acc;
    },
    new Map()
  );

  const cookedStats = {
    timesCooked: cookedAggregate._count._all,
    averageRating: cookedAggregate._avg.rating,
  };

  const reactionSummary = Array.from(reactionSummaryMap.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    users: data.users,
  }));

  return {
    id: post.id,
    title: post.title,
    caption: post.caption ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    mainPhotoUrl: post.mainPhotoUrl ?? null,
    isFavorited,
    author: {
      id: post.author.id,
      name: post.author.name,
      avatarUrl: post.author.avatarUrl,
    },
    editor: post.editor
      ? {
          id: post.editor.id,
          name: post.editor.name,
        }
      : null,
    lastEditNote: post.lastEditNote ?? null,
    lastEditAt: post.lastEditAt ? post.lastEditAt.toISOString() : null,
    photos: post.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
    })),
    recipe: post.recipeDetails
      ? {
          origin: post.recipeDetails.origin ?? null,
          ingredients: parseRecipeIngredients(post.recipeDetails.ingredients),
          steps: parseRecipeSteps(post.recipeDetails.steps),
          totalTime: post.recipeDetails.totalTime ?? null,
          servings: post.recipeDetails.servings ?? null,
          courses: parseCourseList(post.recipeDetails.courses, post.recipeDetails.course),
          primaryCourse: post.recipeDetails.course ?? null,
          difficulty: post.recipeDetails.difficulty ?? null,
        }
      : null,
    tags: post.tags.map((entry) => entry.tag.name),
    reactionSummary,
    cookedStats,
    comments: commentPage.comments,
    commentsPage: {
      hasMore: commentPage.hasMore,
      nextOffset: commentPage.nextOffset,
    },
    recentCooked: cookedPage.entries,
    recentCookedPage: {
      hasMore: cookedPage.hasMore,
      nextOffset: cookedPage.nextOffset,
    },
  };
}

interface RawCommentRecord {
  id: string;
  text: string;
  photoUrl: string | null;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

function clampCommentLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return COMMENT_DEFAULT_LIMIT;
  }

  const normalized = Math.max(1, Math.floor(limit));
  return Math.min(normalized, COMMENT_MAX_LIMIT);
}

export async function getPostCommentsPage(
  options: CommentPageOptions
): Promise<CommentPageResult> {
  const limit = clampCommentLimit(options.limit);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const records = await prisma.comment.findMany({
    where: {
      postId: options.postId,
      post: {
        familySpaceId: options.familySpaceId,
      },
      deletedAt: null,
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip: offset,
    take: limit + 1,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, limit) : records;
  const chronologicalRecords = [...pageRecords].reverse();
  const comments = await attachReactionsToComments(chronologicalRecords);

  return {
    comments,
    hasMore,
    nextOffset: offset + pageRecords.length,
  };
}

async function attachReactionsToComments(
  records: RawCommentRecord[]
): Promise<PostDetailComment[]> {
  if (records.length === 0) {
    return [];
  }

  const commentIds = records.map((record) => record.id);
  const reactions = await prisma.reaction.findMany({
    where: {
      targetType: 'comment',
      targetId: {
        in: commentIds,
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      targetId: true,
      emoji: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  const reactionMap = reactions.reduce<Record<string, PostDetailComment['reactions']>>(
    (acc, reaction) => {
      const list = acc[reaction.targetId] ?? [];
      let entry = list.find((item) => item.emoji === reaction.emoji);

      if (!entry) {
        entry = { emoji: reaction.emoji, count: 0, users: [] };
        list.push(entry);
        acc[reaction.targetId] = list;
      }

      entry.count += 1;
      entry.users.push({
        id: reaction.user.id,
        name: reaction.user.name,
        avatarUrl: reaction.user.avatarUrl,
      });
      return acc;
    },
    {}
  );

  return records.map((record) => ({
    id: record.id,
    text: record.text,
    photoUrl: record.photoUrl,
    createdAt: record.createdAt.toISOString(),
    author: {
      id: record.author.id,
      name: record.author.name,
      avatarUrl: record.author.avatarUrl,
    },
    reactions: reactionMap[record.id] ?? [],
  }));
}

function clampCookedLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return COOKED_DEFAULT_LIMIT;
  }

  const normalized = Math.max(1, Math.floor(limit));
  return Math.min(normalized, COOKED_MAX_LIMIT);
}

export async function getPostCookedEventsPage(
  options: CookedPageOptions
): Promise<CookedPageResult> {
  const limit = clampCookedLimit(options.limit);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const records = await prisma.cookedEvent.findMany({
    where: {
      postId: options.postId,
      post: {
        familySpaceId: options.familySpaceId,
      },
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip: offset,
    take: limit + 1,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, limit) : records;

  const entries: PostCookedEntry[] = pageRecords.map((record) => ({
    id: record.id,
    rating: record.rating,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    user: {
      id: record.user.id,
      name: record.user.name,
      avatarUrl: record.user.avatarUrl,
    },
  }));

  return {
    entries,
    hasMore,
    nextOffset: offset + pageRecords.length,
  };
}
