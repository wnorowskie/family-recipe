import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getUserPostsForProfile,
  getUserCookedHistory,
  getUserFavorites,
} from '@/lib/profile';

const mockResolveUrl = jest.fn(async (key?: string | null) => key ?? null);

jest.mock('@/lib/prisma', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

jest.mock('@/lib/uploads', () => ({
  createSignedUrlResolver: jest.fn(() => mockResolveUrl),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

describe('getUserPostsForProfile', () => {
  const userId = 'user-123';
  const familySpaceId = 'family-456';

  beforeEach(() => {
    mockReset(prismaMock);
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(
      async (key?: string | null) => key ?? null
    );
  });

  describe('Empty Results', () => {
    it('returns empty array when user has no posts', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(10);
    });

    it('uses default pagination values', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);

      await getUserPostsForProfile(userId, familySpaceId);

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          authorId: userId,
          familySpaceId,
        },
        orderBy: { createdAt: 'desc' },
        take: 11,
        skip: 0,
      });
    });
  });

  describe('Pagination', () => {
    it('accepts custom limit and offset', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);

      await getUserPostsForProfile(userId, familySpaceId, {
        limit: 5,
        offset: 10,
      });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          authorId: userId,
          familySpaceId,
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        skip: 10,
      });
    });

    it('returns hasMore: true when more posts exist', async () => {
      const posts = Array.from({ length: 11 }, (_, i) => ({
        id: `post-${i}`,
        title: `Post ${i}`,
        caption: null,
        mainPhotoUrl: null,
        authorId: userId,
        familySpaceId,
        createdAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        updatedAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        lastEditedById: null,
        lastEditAt: null,
        lastEditNote: null,
        hasRecipe: false,
      }));

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });

    it('returns hasMore: false when no more posts exist', async () => {
      const posts = Array.from({ length: 5 }, (_, i) => ({
        id: `post-${i}`,
        title: `Post ${i}`,
        caption: null,
        mainPhotoUrl: null,
        authorId: userId,
        familySpaceId,
        createdAt: new Date(`2025-01-0${i + 1}T00:00:00.000Z`),
        updatedAt: new Date(`2025-01-0${i + 1}T00:00:00.000Z`),
        lastEditedById: null,
        lastEditAt: null,
        lastEditNote: null,
        hasRecipe: false,
      }));

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('calculates correct nextOffset', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId, {
        limit: 15,
        offset: 30,
      });

      expect(result.nextOffset).toBe(45);
    });
  });

  describe('Cooked Stats Aggregation', () => {
    it('includes cooked stats for posts with events', async () => {
      const posts = [
        {
          id: 'post-1',
          title: 'Recipe 1',
          caption: null,
          mainPhotoUrl: 'photo1.jpg',
          mainPhotoStorageKey: 'photo1.jpg',
          authorId: userId,
          familySpaceId,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          lastEditedById: null,
          lastEditAt: null,
          lastEditNote: null,
          hasRecipe: true,
        },
      ];

      const cookedStats = [
        {
          postId: 'post-1',
          _count: { _all: 5 },
          _avg: { rating: 4.5 },
        },
      ];

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue(
        cookedStats as any
      );

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items[0].cookedStats).toEqual({
        timesCooked: 5,
        averageRating: 4.5,
      });
    });

    it('returns zero stats for posts with no cooked events', async () => {
      const posts = [
        {
          id: 'post-1',
          title: 'Recipe 1',
          caption: null,
          mainPhotoUrl: null,
          authorId: userId,
          familySpaceId,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          lastEditedById: null,
          lastEditAt: null,
          lastEditNote: null,
          hasRecipe: true,
        },
      ];

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items[0].cookedStats).toEqual({
        timesCooked: 0,
        averageRating: null,
      });
    });

    it('handles null average rating', async () => {
      const posts = [
        {
          id: 'post-1',
          title: 'Recipe 1',
          caption: null,
          mainPhotoUrl: null,
          authorId: userId,
          familySpaceId,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          lastEditedById: null,
          lastEditAt: null,
          lastEditNote: null,
          hasRecipe: true,
        },
      ];

      const cookedStats = [
        {
          postId: 'post-1',
          _count: { _all: 3 },
          _avg: { rating: null },
        },
      ];

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue(
        cookedStats as any
      );

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items[0].cookedStats).toEqual({
        timesCooked: 3,
        averageRating: null,
      });
    });

    it('skips cooked stats query when no posts returned', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);

      await getUserPostsForProfile(userId, familySpaceId);

      expect(prismaMock.cookedEvent.groupBy).not.toHaveBeenCalled();
    });

    it('queries cooked stats only for returned posts (not pagination overflow)', async () => {
      const posts = Array.from({ length: 11 }, (_, i) => ({
        id: `post-${i}`,
        title: `Post ${i}`,
        caption: null,
        mainPhotoUrl: null,
        authorId: userId,
        familySpaceId,
        createdAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        updatedAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        lastEditedById: null,
        lastEditAt: null,
        lastEditNote: null,
        hasRecipe: false,
      }));

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      await getUserPostsForProfile(userId, familySpaceId, { limit: 10 });

      expect(prismaMock.cookedEvent.groupBy).toHaveBeenCalledWith({
        where: {
          postId: { in: posts.slice(0, 10).map((p) => p.id) },
        },
        by: ['postId'],
        _count: { _all: true },
        _avg: { rating: true },
      });
    });
  });

  describe('Data Structure', () => {
    it('returns posts with correct structure', async () => {
      const posts = [
        {
          id: 'post-123',
          title: 'My Recipe',
          caption: 'A delicious recipe',
          mainPhotoUrl: 'https://example.com/photo.jpg',
          mainPhotoStorageKey: 'https://example.com/photo.jpg',
          authorId: userId,
          familySpaceId,
          createdAt: new Date('2025-01-15T12:30:00.000Z'),
          updatedAt: new Date('2025-01-15T12:30:00.000Z'),
          lastEditedById: null,
          lastEditAt: null,
          lastEditNote: null,
          hasRecipe: true,
        },
      ];

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items[0]).toEqual({
        id: 'post-123',
        title: 'My Recipe',
        mainPhotoUrl: 'https://example.com/photo.jpg',
        createdAt: '2025-01-15T12:30:00.000Z',
        cookedStats: {
          timesCooked: 0,
          averageRating: null,
        },
      });
    });

    it('handles null mainPhotoUrl', async () => {
      const posts = [
        {
          id: 'post-1',
          title: 'No Photo Post',
          caption: null,
          mainPhotoUrl: null,
          authorId: userId,
          familySpaceId,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          lastEditedById: null,
          lastEditAt: null,
          lastEditNote: null,
          hasRecipe: false,
        },
      ];

      prismaMock.post.findMany.mockResolvedValue(posts as any);
      (prismaMock.cookedEvent.groupBy as any).mockResolvedValue([]);

      const result = await getUserPostsForProfile(userId, familySpaceId);

      expect(result.items[0].mainPhotoUrl).toBeNull();
    });
  });
});

describe('getUserCookedHistory', () => {
  const userId = 'user-123';
  const familySpaceId = 'family-456';

  beforeEach(() => {
    mockReset(prismaMock);
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(
      async (key?: string | null) => key ?? null
    );
  });

  describe('Empty Results', () => {
    it('returns empty array when user has no cooked events', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(10);
    });

    it('uses default pagination values', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getUserCookedHistory(userId, familySpaceId);

      expect(prismaMock.cookedEvent.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          post: {
            familySpaceId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 11,
        skip: 0,
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
    });
  });

  describe('Pagination', () => {
    it('accepts custom limit and offset', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getUserCookedHistory(userId, familySpaceId, {
        limit: 5,
        offset: 10,
      });

      expect(prismaMock.cookedEvent.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          post: {
            familySpaceId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        skip: 10,
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
    });

    it('returns hasMore: true when more events exist', async () => {
      const events = Array.from({ length: 11 }, (_, i) => ({
        id: `cooked-${i}`,
        userId,
        postId: `post-${i}`,
        rating: 5,
        note: `Note ${i}`,
        createdAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        post: {
          id: `post-${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: `photo${i}.jpg`,
          mainPhotoStorageKey: `photo${i}.jpg`,
        },
      }));

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });

    it('returns hasMore: false when no more events exist', async () => {
      const events = Array.from({ length: 5 }, (_, i) => ({
        id: `cooked-${i}`,
        userId,
        postId: `post-${i}`,
        rating: 5,
        note: null,
        createdAt: new Date(`2025-01-0${i + 1}T00:00:00.000Z`),
        post: {
          id: `post-${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: null,
        },
      }));

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('calculates correct nextOffset', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getUserCookedHistory(userId, familySpaceId, {
        limit: 15,
        offset: 30,
      });

      expect(result.nextOffset).toBe(45);
    });
  });

  describe('Data Structure', () => {
    it('returns cooked events with correct structure', async () => {
      const events = [
        {
          id: 'cooked-123',
          userId,
          postId: 'post-456',
          rating: 4,
          note: 'Delicious!',
          createdAt: new Date('2025-01-15T18:30:00.000Z'),
          post: {
            id: 'post-456',
            title: 'Chocolate Cake',
            mainPhotoUrl: 'https://example.com/cake.jpg',
            mainPhotoStorageKey: 'https://example.com/cake.jpg',
          },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items[0]).toEqual({
        id: 'cooked-123',
        createdAt: '2025-01-15T18:30:00.000Z',
        rating: 4,
        note: 'Delicious!',
        post: {
          id: 'post-456',
          title: 'Chocolate Cake',
          mainPhotoUrl: 'https://example.com/cake.jpg',
        },
      });
    });

    it('handles null rating', async () => {
      const events = [
        {
          id: 'cooked-1',
          userId,
          postId: 'post-1',
          rating: null,
          note: 'Made it',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'Recipe',
            mainPhotoUrl: null,
          },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items[0].rating).toBeNull();
    });

    it('handles null note', async () => {
      const events = [
        {
          id: 'cooked-1',
          userId,
          postId: 'post-1',
          rating: 5,
          note: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'Recipe',
            mainPhotoUrl: null,
          },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items[0].note).toBeNull();
    });

    it('handles null mainPhotoUrl in post', async () => {
      const events = [
        {
          id: 'cooked-1',
          userId,
          postId: 'post-1',
          rating: 3,
          note: 'Good',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'No Photo Recipe',
            mainPhotoUrl: null,
            mainPhotoStorageKey: null,
          },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items[0].post.mainPhotoUrl).toBeNull();
    });
  });

  describe('Ordering', () => {
    it('orders cooked events by createdAt descending', async () => {
      const events = [
        {
          id: 'cooked-3',
          userId,
          postId: 'post-3',
          rating: 5,
          note: null,
          createdAt: new Date('2025-01-03T00:00:00.000Z'),
          post: { id: 'post-3', title: 'Recipe 3', mainPhotoUrl: null },
        },
        {
          id: 'cooked-2',
          userId,
          postId: 'post-2',
          rating: 4,
          note: null,
          createdAt: new Date('2025-01-02T00:00:00.000Z'),
          post: { id: 'post-2', title: 'Recipe 2', mainPhotoUrl: null },
        },
        {
          id: 'cooked-1',
          userId,
          postId: 'post-1',
          rating: 3,
          note: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: { id: 'post-1', title: 'Recipe 1', mainPhotoUrl: null },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(events as any);

      const result = await getUserCookedHistory(userId, familySpaceId);

      expect(result.items[0].id).toBe('cooked-3');
      expect(result.items[1].id).toBe('cooked-2');
      expect(result.items[2].id).toBe('cooked-1');
    });
  });
});

describe('getUserFavorites', () => {
  const userId = 'user-123';
  const familySpaceId = 'family-456';

  beforeEach(() => {
    mockReset(prismaMock);
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(
      async (key?: string | null) => key ?? null
    );
  });

  describe('Empty Results', () => {
    it('returns empty array when user has no favorites', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([]);

      const result = await getUserFavorites(userId, familySpaceId);

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(10);
    });

    it('uses default pagination values', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([]);

      await getUserFavorites(userId, familySpaceId);

      expect(prismaMock.favorite.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          post: {
            familySpaceId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 11,
        skip: 0,
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
    });
  });

  describe('Pagination', () => {
    it('accepts custom limit and offset', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([]);

      await getUserFavorites(userId, familySpaceId, {
        limit: 5,
        offset: 10,
      });

      expect(prismaMock.favorite.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          post: {
            familySpaceId,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        skip: 10,
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
    });

    it('returns hasMore: true when more favorites exist', async () => {
      const favorites = Array.from({ length: 11 }, (_, i) => ({
        id: `fav-${i}`,
        userId,
        postId: `post-${i}`,
        createdAt: new Date(
          `2025-01-01T${String(i).padStart(2, '0')}:00:00.000Z`
        ),
        post: {
          id: `post-${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: `photo${i}.jpg`,
          mainPhotoStorageKey: `photo${i}.jpg`,
          author: {
            name: `Author ${i}`,
          },
        },
      }));

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });

    it('returns hasMore: false when no more favorites exist', async () => {
      const favorites = Array.from({ length: 5 }, (_, i) => ({
        id: `fav-${i}`,
        userId,
        postId: `post-${i}`,
        createdAt: new Date(`2025-01-0${i + 1}T00:00:00.000Z`),
        post: {
          id: `post-${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: null,
          author: {
            name: `Author ${i}`,
          },
        },
      }));

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId, {
        limit: 10,
      });

      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('calculates correct nextOffset', async () => {
      prismaMock.favorite.findMany.mockResolvedValue([]);

      const result = await getUserFavorites(userId, familySpaceId, {
        limit: 15,
        offset: 30,
      });

      expect(result.nextOffset).toBe(45);
    });
  });

  describe('Data Structure', () => {
    it('returns favorites with correct structure', async () => {
      const favorites = [
        {
          id: 'fav-123',
          userId,
          postId: 'post-456',
          createdAt: new Date('2025-01-15T20:00:00.000Z'),
          post: {
            id: 'post-456',
            title: 'Amazing Recipe',
            mainPhotoUrl: 'https://example.com/recipe.jpg',
            mainPhotoStorageKey: 'https://example.com/recipe.jpg',
            author: {
              name: 'John Doe',
            },
          },
        },
      ];

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId);

      expect(result.items[0]).toEqual({
        id: 'fav-123',
        createdAt: '2025-01-15T20:00:00.000Z',
        post: {
          id: 'post-456',
          title: 'Amazing Recipe',
          mainPhotoUrl: 'https://example.com/recipe.jpg',
          authorName: 'John Doe',
        },
      });
    });

    it('handles null mainPhotoUrl in post', async () => {
      const favorites = [
        {
          id: 'fav-1',
          userId,
          postId: 'post-1',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'No Photo Recipe',
            mainPhotoUrl: null,
            mainPhotoStorageKey: null,
            author: {
              name: 'Jane Smith',
            },
          },
        },
      ];

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId);

      expect(result.items[0].post.mainPhotoUrl).toBeNull();
    });

    it('includes author name from nested relation', async () => {
      const favorites = [
        {
          id: 'fav-1',
          userId,
          postId: 'post-1',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'Recipe',
            mainPhotoUrl: null,
            mainPhotoStorageKey: null,
            author: {
              name: 'Alice Johnson',
            },
          },
        },
      ];

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId);

      expect(result.items[0].post.authorName).toBe('Alice Johnson');
    });
  });

  describe('Ordering', () => {
    it('orders favorites by createdAt descending', async () => {
      const favorites = [
        {
          id: 'fav-3',
          userId,
          postId: 'post-3',
          createdAt: new Date('2025-01-03T00:00:00.000Z'),
          post: {
            id: 'post-3',
            title: 'Recipe 3',
            mainPhotoUrl: null,
            mainPhotoStorageKey: null,
            author: { name: 'Author 3' },
          },
        },
        {
          id: 'fav-2',
          userId,
          postId: 'post-2',
          createdAt: new Date('2025-01-02T00:00:00.000Z'),
          post: {
            id: 'post-2',
            title: 'Recipe 2',
            mainPhotoUrl: null,
            mainPhotoStorageKey: null,
            author: { name: 'Author 2' },
          },
        },
        {
          id: 'fav-1',
          userId,
          postId: 'post-1',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          post: {
            id: 'post-1',
            title: 'Recipe 1',
            mainPhotoUrl: null,
            author: { name: 'Author 1' },
          },
        },
      ];

      prismaMock.favorite.findMany.mockResolvedValue(favorites as any);

      const result = await getUserFavorites(userId, familySpaceId);

      expect(result.items[0].id).toBe('fav-3');
      expect(result.items[1].id).toBe('fav-2');
      expect(result.items[2].id).toBe('fav-1');
    });
  });
});
