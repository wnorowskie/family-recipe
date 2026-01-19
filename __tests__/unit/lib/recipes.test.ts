/**
 * Unit tests for recipe filtering and parsing
 *
 * Coverage goals:
 * - parseCourses() behavior via getRecipes mapping
 * - getRecipes() filter construction, sorting, pagination, and stats aggregation
 */

import { getRecipes } from '@/lib/recipes';
import {
  prismaMock,
  resetPrismaMock,
} from '../../integration/helpers/mock-prisma';

const mockResolveUrl = jest.fn(async (key?: string | null) => key ?? null);

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: require('../../integration/helpers/mock-prisma').prismaMock,
}));

jest.mock('@/lib/uploads', () => ({
  createSignedUrlResolver: jest.fn(() => mockResolveUrl),
}));

const mockPostFindMany = prismaMock.post.findMany as jest.MockedFunction<
  typeof prismaMock.post.findMany
>;
const mockCookedGroupBy = prismaMock.cookedEvent.groupBy as jest.MockedFunction<
  typeof prismaMock.cookedEvent.groupBy
>;

const latestPostArgs = () => {
  const args = mockPostFindMany.mock.calls.at(-1)?.[0];
  if (!args) {
    throw new Error('Expected prisma.post.findMany to be called');
  }
  return args;
};

describe('Recipe Utilities', () => {
  const baseInput = {
    familySpaceId: 'family_1',
    limit: 2,
    offset: 0,
  };

  beforeEach(() => {
    resetPrismaMock();
    mockPostFindMany.mockResolvedValue([] as any);
    mockCookedGroupBy.mockResolvedValue([] as any);
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(
      async (key?: string | null) => key ?? null
    );
  });

  describe('getRecipes - query building', () => {
    it('uses default recent sorting and pagination', async () => {
      await getRecipes({ ...baseInput });

      const args = latestPostArgs();
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }]);
      expect(args.take).toBe(baseInput.limit + 1);
      expect(args.skip).toBe(baseInput.offset);
      expect(args.include).toEqual({
        author: { select: { id: true, name: true, avatarStorageKey: true } },
        recipeDetails: true,
        tags: { include: { tag: true } },
      });
      expect(args.where).toEqual({
        familySpaceId: baseInput.familySpaceId,
        hasRecipeDetails: true,
      });
    });

    it('applies alpha sorting with title then createdAt', async () => {
      await getRecipes({ ...baseInput, sort: 'alpha' });

      const args = latestPostArgs();
      expect(args.orderBy).toEqual([{ title: 'asc' }, { createdAt: 'desc' }]);
    });

    it('adds trimmed search filter when search provided', async () => {
      await getRecipes({ ...baseInput, search: '  cake  ' });

      const args = latestPostArgs();
      expect(args?.where?.AND).toContainEqual({
        title: { contains: 'cake', mode: 'insensitive' },
      });
    });

    it('ignores empty search and leaves AND undefined', async () => {
      await getRecipes({ ...baseInput, search: '   ' });

      const args = latestPostArgs();
      expect(args.where?.AND).toBeUndefined();
    });

    it('filters by authorIds after trimming and deduping', async () => {
      await getRecipes({
        ...baseInput,
        authorIds: ['user_1', ' user_2 ', '', 'user_1', 123 as any],
      });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          authorId: { in: ['user_1', 'user_2'] },
        },
      ]);
    });

    it('filters valid courses and builds OR conditions', async () => {
      await getRecipes({
        ...baseInput,
        courses: ['breakfast', 'invalid', 'dinner', 'breakfast', 10 as any],
      });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          OR: [
            {
              recipeDetails: {
                is: {
                  OR: [
                    { course: 'breakfast' },
                    {
                      courses: {
                        contains: JSON.stringify('breakfast'),
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            },
            {
              recipeDetails: {
                is: {
                  OR: [
                    { course: 'dinner' },
                    {
                      courses: {
                        contains: JSON.stringify('dinner'),
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ]);
    });

    it('adds tag filters for each tag', async () => {
      await getRecipes({ ...baseInput, tags: ['vegan', 'quick'] });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        { tags: { some: { tag: { name: 'vegan' } } } },
        { tags: { some: { tag: { name: 'quick' } } } },
      ]);
    });

    it('filters by valid difficulties and ignores invalid', async () => {
      await getRecipes({
        ...baseInput,
        difficulties: ['easy', 'hard', 'impossible', 'easy'],
      });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          recipeDetails: {
            is: {
              difficulty: {
                in: ['easy', 'hard'],
              },
            },
          },
        },
      ]);
    });

    it('applies total time filters when provided', async () => {
      await getRecipes({
        ...baseInput,
        minTotalMinutes: 15,
        maxTotalMinutes: 60,
      });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          recipeDetails: {
            is: {
              totalTime: {
                gte: 15,
                lte: 60,
              },
            },
          },
        },
      ]);
    });

    it('applies servings range filters', async () => {
      await getRecipes({ ...baseInput, minServings: 2, maxServings: 6 });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          recipeDetails: {
            is: {
              servings: {
                gte: 2,
                lte: 6,
              },
            },
          },
        },
      ]);
    });

    it('adds ingredient contains filters for each keyword', async () => {
      await getRecipes({ ...baseInput, ingredients: ['chocolate', 'milk'] });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        {
          recipeDetails: {
            is: {
              ingredients: {
                contains: 'chocolate',
              },
            },
          },
        },
        {
          recipeDetails: {
            is: {
              ingredients: {
                contains: 'milk',
              },
            },
          },
        },
      ]);
    });

    it('skips course filter when no valid values provided', async () => {
      await getRecipes({ ...baseInput, courses: ['invalid', 123 as any] });

      const args = latestPostArgs();
      expect(args.where?.AND).toBeUndefined();
    });

    it('skips author filter when no valid IDs remain after normalization', async () => {
      await getRecipes({ ...baseInput, authorIds: ['   ', 123 as any] });

      const args = latestPostArgs();
      expect(args.where?.AND).toBeUndefined();
    });

    it('combines multiple filters in order', async () => {
      await getRecipes({
        ...baseInput,
        search: ' pasta ',
        authorIds: ['auth_1'],
        courses: ['dinner'],
        tags: ['vegan'],
        difficulties: ['medium'],
        minTotalMinutes: 20,
        maxTotalMinutes: 40,
        minServings: 2,
        maxServings: 6,
        ingredients: ['tomato'],
      });

      const args = latestPostArgs();
      expect(args.where?.AND).toEqual([
        { title: { contains: 'pasta', mode: 'insensitive' } },
        { authorId: { in: ['auth_1'] } },
        {
          OR: [
            {
              recipeDetails: {
                is: {
                  OR: [
                    { course: 'dinner' },
                    {
                      courses: {
                        contains: JSON.stringify('dinner'),
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        { tags: { some: { tag: { name: 'vegan' } } } },
        {
          recipeDetails: {
            is: {
              difficulty: { in: ['medium'] },
            },
          },
        },
        {
          recipeDetails: {
            is: {
              totalTime: { gte: 20, lte: 40 },
            },
          },
        },
        {
          recipeDetails: {
            is: {
              servings: { gte: 2, lte: 6 },
            },
          },
        },
        {
          recipeDetails: {
            is: {
              ingredients: { contains: 'tomato' },
            },
          },
        },
      ]);
    });
  });

  describe('getRecipes - course parsing', () => {
    it('parses JSON course array and deduplicates valid values', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'Overnight Oats',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['breakfast', 'breakfast', 'invalid']),
            course: 'dinner',
            difficulty: 'easy',
            totalTime: 10,
            servings: 2,
          },
          tags: [],
        } as any,
      ]);

      const result = await getRecipes({ ...baseInput });

      expect(result.items[0].courses).toEqual(['breakfast']);
      expect(result.items[0].primaryCourse).toBe('breakfast');
    });

    it('preserves order of valid courses while deduplicating', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'Tasting Menu',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['dinner', 'breakfast', 'dinner', 'lunch']),
            course: 'snack',
          },
          tags: [],
        } as any,
      ]);

      const result = await getRecipes({ ...baseInput });

      expect(result.items[0].courses).toEqual(['dinner', 'breakfast', 'lunch']);
      expect(result.items[0].primaryCourse).toBe('dinner');
    });

    it('falls back to single course when JSON is invalid', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_2',
          title: 'Apple Pie',
          mainPhotoUrl: '/pie.jpg',
          mainPhotoStorageKey: '/pie.jpg',
          author: {
            id: 'user_2',
            name: 'Bob',
            avatarUrl: '/avatar.jpg',
            avatarStorageKey: '/avatar.jpg',
          },
          recipeDetails: {
            courses: 'not valid json',
            course: 'dessert',
            difficulty: 'medium',
            totalTime: 90,
            servings: 8,
          },
          tags: [],
        } as any,
      ]);

      const result = await getRecipes({ ...baseInput });

      expect(result.items[0].courses).toEqual(['dessert']);
      expect(result.items[0].primaryCourse).toBe('dessert');
    });

    it('uses fallback course when parsed array is empty', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_4',
          title: 'Simple Rice',
          mainPhotoUrl: null,
          author: { id: 'user_4', name: 'Dana', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify([]),
            course: 'lunch',
          },
          tags: [],
        } as any,
      ]);

      const result = await getRecipes({ ...baseInput });

      expect(result.items[0].courses).toEqual(['lunch']);
      expect(result.items[0].primaryCourse).toBe('lunch');
    });

    it('returns empty courses when none are valid and no fallback', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_3',
          title: 'Mystery Dish',
          mainPhotoUrl: null,
          author: { id: 'user_3', name: 'Carol', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['unknown']),
            course: null,
            difficulty: null,
            totalTime: null,
            servings: null,
          },
          tags: [],
        } as any,
      ]);

      const result = await getRecipes({ ...baseInput });

      expect(result.items[0].courses).toEqual([]);
      expect(result.items[0].primaryCourse).toBeNull();
    });
  });

  describe('getRecipes - cooked stats and pagination', () => {
    it('returns empty items with hasMore false when no posts found', async () => {
      const result = await getRecipes({ ...baseInput });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(baseInput.offset + baseInput.limit);
      expect(mockCookedGroupBy).not.toHaveBeenCalled();
    });

    it('aggregates cooked stats for returned posts', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'Salad',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['lunch']),
            course: 'lunch',
            difficulty: 'easy',
            totalTime: 20,
            servings: 2,
          },
          tags: [],
        },
        {
          id: 'post_2',
          title: 'Pasta',
          mainPhotoUrl: null,
          author: { id: 'user_2', name: 'Bob', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['dinner']),
            course: 'dinner',
            difficulty: 'medium',
            totalTime: 40,
            servings: 4,
          },
          tags: [],
        },
      ] as any);

      mockCookedGroupBy.mockResolvedValue([
        {
          postId: 'post_1',
          _count: { _all: 3 },
          _avg: { rating: 4.5 },
        },
        {
          postId: 'post_2',
          _count: { _all: 1 },
          _avg: { rating: 5 },
        },
      ] as any);

      const result = await getRecipes({ ...baseInput, limit: 5 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].cookedStats).toEqual({
        timesCooked: 3,
        averageRating: 4.5,
      });
      expect(result.items[1].cookedStats).toEqual({
        timesCooked: 1,
        averageRating: 5,
      });
    });

    it('defaults cooked stats when no group data returned', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'Soup',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['dinner']),
            course: 'dinner',
          },
          tags: [],
        },
        {
          id: 'post_2',
          title: 'Bread',
          mainPhotoUrl: null,
          author: { id: 'user_2', name: 'Bob', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['snack']),
            course: 'snack',
          },
          tags: [],
        },
      ] as any);

      mockCookedGroupBy.mockResolvedValue([
        {
          postId: 'post_1',
          _count: { _all: 2 },
          _avg: { rating: null },
        },
      ] as any);

      const result = await getRecipes({ ...baseInput, limit: 5 });

      expect(result.items[0].cookedStats).toEqual({
        timesCooked: 2,
        averageRating: null,
      });
      expect(result.items[1].cookedStats).toEqual({
        timesCooked: 0,
        averageRating: null,
      });
    });

    it('queries cooked stats only for sliced post IDs', async () => {
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'First',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['breakfast']),
            course: 'breakfast',
          },
          tags: [],
        },
        {
          id: 'post_2',
          title: 'Second',
          mainPhotoUrl: null,
          author: { id: 'user_2', name: 'Bob', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['lunch']),
            course: 'lunch',
          },
          tags: [],
        },
      ] as any);

      await getRecipes({ ...baseInput, limit: 1 });

      expect(mockCookedGroupBy).toHaveBeenCalledWith({
        where: { postId: { in: ['post_1'] } },
        by: ['postId'],
        _count: { _all: true },
        _avg: { rating: true },
      });
    });

    it('calculates hasMore and slices extra record', async () => {
      const limit = 2;
      prismaMock.post.findMany.mockResolvedValue([
        {
          id: 'post_1',
          title: 'First',
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['breakfast']),
            course: 'breakfast',
          },
          tags: [],
        },
        {
          id: 'post_2',
          title: 'Second',
          mainPhotoUrl: null,
          author: { id: 'user_2', name: 'Bob', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['lunch']),
            course: 'lunch',
          },
          tags: [],
        },
        {
          id: 'post_3',
          title: 'Third',
          mainPhotoUrl: null,
          author: { id: 'user_3', name: 'Carol', avatarUrl: null },
          recipeDetails: {
            courses: JSON.stringify(['dinner']),
            course: 'dinner',
          },
          tags: [],
        },
      ] as any);

      mockCookedGroupBy.mockResolvedValue([] as any);

      const result = await getRecipes({ ...baseInput, limit, offset: 5 });

      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(limit);
      expect(result.items.map((item) => item.id)).toEqual(['post_1', 'post_2']);
      expect(result.nextOffset).toBe(5 + limit);

      const args = latestPostArgs();
      expect(args.take).toBe(limit + 1);
      expect(args.skip).toBe(5);
    });
  });
});
