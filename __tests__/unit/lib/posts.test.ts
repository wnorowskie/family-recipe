import { getPostCommentsPage, getPostCookedEventsPage, getPostDetail } from '@/lib/posts';
import { prismaMock, resetPrismaMock } from '../../integration/helpers/mock-prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: require('../../integration/helpers/mock-prisma').prismaMock,
}));

describe('Posts Utilities', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('getPostDetail', () => {
    it('returns null when post is not found', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null as any);

      const result = await getPostDetail('missing', 'family_1');

      expect(result).toBeNull();
      expect(prismaMock.favorite.findUnique).not.toHaveBeenCalled();
    });

    it('returns hydrated post details with reactions, favorites, recipe parsing, comments, and cooked data', async () => {
      const createdAt = new Date('2024-01-01T10:00:00Z');
      const updatedAt = new Date('2024-01-02T10:00:00Z');
      const lastEditAt = new Date('2024-01-03T10:00:00Z');

      prismaMock.post.findFirst.mockResolvedValue({
        id: 'post_1',
        title: 'Family Dinner',
        caption: null,
        createdAt,
        updatedAt,
        mainPhotoUrl: null,
        author: { id: 'user_1', name: 'Alice', avatarUrl: '/avatar.jpg' },
        editor: { id: 'user_2', name: 'Bob' },
        lastEditNote: 'Tweaked recipe',
        lastEditAt,
        photos: [
          { id: 'photo_1', url: '/p1.jpg' },
          { id: 'photo_2', url: '/p2.jpg' },
        ],
        recipeDetails: {
          origin: 'Italy',
          ingredients: JSON.stringify([
            { name: 'Tomato', unit: 'cup', quantity: 2 },
            { name: 'Invalid Unit', unit: 'invalid', quantity: 1 },
            { name: 'Null Quantity', unit: 'cup', quantity: null },
            { name: 123, unit: 'cup', quantity: 2 },
          ]),
          steps: JSON.stringify([{ text: 'Prep' }, { text: 5 }, null]),
          totalTime: 45,
          servings: 4,
          courses: JSON.stringify(['dinner', 'dinner', 'invalid', 'breakfast']),
          course: 'lunch',
          difficulty: 'medium',
        },
        tags: [{ tag: { name: 'vegan' } }, { tag: { name: 'quick' } }],
        familySpaceId: 'family_1',
      } as any);

      prismaMock.favorite.findUnique.mockResolvedValue({ id: 'fav_1' } as any);

      const commentRecords = [
        {
          id: 'comment_2',
          text: 'Looks great',
          photoUrl: null,
          createdAt: new Date('2024-01-05T12:00:00Z'),
          author: { id: 'user_3', name: 'Carol', avatarUrl: null },
        },
        {
          id: 'comment_1',
          text: 'Nice!',
          photoUrl: '/photo.png',
          createdAt: new Date('2024-01-04T12:00:00Z'),
          author: { id: 'user_4', name: 'Dave', avatarUrl: '/dave.png' },
        },
      ];
      prismaMock.comment.findMany.mockResolvedValue(commentRecords as any);

      const cookedRecords = [
        {
          id: 'cooked_1',
          rating: 5,
          note: 'Great',
          createdAt: new Date('2024-01-06T12:00:00Z'),
          user: { id: 'user_5', name: 'Eve', avatarUrl: null },
        },
        {
          id: 'cooked_2',
          rating: 4,
          note: null,
          createdAt: new Date('2024-01-07T12:00:00Z'),
          user: { id: 'user_6', name: 'Frank', avatarUrl: '/frank.jpg' },
        },
      ];
      prismaMock.cookedEvent.findMany.mockResolvedValue(cookedRecords as any);

      prismaMock.reaction.findMany.mockImplementation(async (args: any) => {
        if (args.where?.targetType === 'comment') {
          return [
            {
              targetId: 'comment_1',
              emoji: '👍',
              user: { id: 'user_7', name: 'Grace', avatarUrl: null },
            },
            {
              targetId: 'comment_1',
              emoji: '👍',
              user: { id: 'user_8', name: 'Henry', avatarUrl: '/henry.png' },
            },
          ] as any;
        }
        return [
          {
            id: 'reaction_1',
            emoji: '❤️',
            user: { id: 'user_9', name: 'Ivy', avatarUrl: '/ivy.jpg' },
          },
          {
            id: 'reaction_2',
            emoji: '❤️',
            user: { id: 'user_10', name: 'Jack', avatarUrl: null },
          },
          {
            id: 'reaction_3',
            emoji: '🔥',
            user: { id: 'user_11', name: 'Kyle', avatarUrl: null },
          },
        ] as any;
      });

      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _avg: { rating: 4.5 },
      } as any);

      const result = await getPostDetail('post_1', 'family_1', 'user_1', {
        commentLimit: 2,
        commentOffset: 0,
        cookedLimit: 3,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('post_1');
      expect(result?.isFavorited).toBe(true);
      expect(result?.author).toEqual({
        id: 'user_1',
        name: 'Alice',
        avatarUrl: '/avatar.jpg',
      });
      expect(result?.editor).toEqual({ id: 'user_2', name: 'Bob' });
      expect(result?.lastEditNote).toBe('Tweaked recipe');
      expect(result?.lastEditAt).toBe(lastEditAt.toISOString());
      expect(result?.photos).toEqual([
        { id: 'photo_1', url: '/p1.jpg' },
        { id: 'photo_2', url: '/p2.jpg' },
      ]);
      expect(result?.recipe).toEqual({
        origin: 'Italy',
        ingredients: [
          { name: 'Tomato', unit: 'cup', quantity: 2 },
          { name: 'Null Quantity', unit: 'cup', quantity: null },
        ],
        steps: [{ text: 'Prep' }],
        totalTime: 45,
        servings: 4,
        courses: ['dinner', 'breakfast'],
        primaryCourse: 'lunch',
        difficulty: 'medium',
      });
      expect(result?.tags).toEqual(['vegan', 'quick']);
      expect(result?.reactionSummary).toEqual([
        {
          emoji: '❤️',
          count: 2,
          users: [
            { id: 'user_9', name: 'Ivy', avatarUrl: '/ivy.jpg' },
            { id: 'user_10', name: 'Jack', avatarUrl: null },
          ],
        },
        {
          emoji: '🔥',
          count: 1,
          users: [{ id: 'user_11', name: 'Kyle', avatarUrl: null }],
        },
      ]);
      expect(result?.cookedStats).toEqual({ timesCooked: 2, averageRating: 4.5 });

      expect(result?.comments).toEqual([
        {
          id: 'comment_1',
          text: 'Nice!',
          photoUrl: '/photo.png',
          createdAt: commentRecords[1].createdAt.toISOString(),
          author: { id: 'user_4', name: 'Dave', avatarUrl: '/dave.png' },
          reactions: [
            {
              emoji: '👍',
              count: 2,
              users: [
                { id: 'user_7', name: 'Grace', avatarUrl: null },
                { id: 'user_8', name: 'Henry', avatarUrl: '/henry.png' },
              ],
            },
          ],
        },
        {
          id: 'comment_2',
          text: 'Looks great',
          photoUrl: null,
          createdAt: commentRecords[0].createdAt.toISOString(),
          author: { id: 'user_3', name: 'Carol', avatarUrl: null },
          reactions: [],
        },
      ]);
      expect(result?.commentsPage).toEqual({ hasMore: false, nextOffset: 2 });

      expect(result?.recentCooked).toEqual([
        {
          id: 'cooked_1',
          rating: 5,
          note: 'Great',
          createdAt: cookedRecords[0].createdAt.toISOString(),
          user: { id: 'user_5', name: 'Eve', avatarUrl: null },
        },
        {
          id: 'cooked_2',
          rating: 4,
          note: null,
          createdAt: cookedRecords[1].createdAt.toISOString(),
          user: { id: 'user_6', name: 'Frank', avatarUrl: '/frank.jpg' },
        },
      ]);
      expect(result?.recentCookedPage).toEqual({ hasMore: false, nextOffset: 2 });
    });
  });

  describe('getPostCommentsPage', () => {
    it('uses default limit and clamps negative offset', async () => {
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);

      const result = await getPostCommentsPage({
        postId: 'post_1',
        familySpaceId: 'family_1',
        offset: -5,
      });

      expect(result).toEqual({ comments: [], hasMore: false, nextOffset: 0 });
      expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 21 })
      );
    });

    it('returns comments in chronological order with reactions aggregated and enforces max limit', async () => {
      const records = Array.from({ length: 51 }, (_, index) => ({
        id: `comment_${index}`,
        text: `Comment ${index}`,
        photoUrl: null,
        createdAt: new Date(2024, 0, 51 - index),
        author: { id: `user_${index}`, name: `User ${index}`, avatarUrl: null },
      }));

      prismaMock.comment.findMany.mockResolvedValue(records as any);
      prismaMock.reaction.findMany.mockResolvedValue([
        {
          targetId: 'comment_0',
          emoji: '😀',
          user: { id: 'user_r', name: 'React User', avatarUrl: null },
        },
      ] as any);

      const result = await getPostCommentsPage({
        postId: 'post_1',
        familySpaceId: 'family_1',
        limit: 100,
        offset: 0,
      });

      expect(result.hasMore).toBe(true);
      expect(result.comments).toHaveLength(50);
      expect(result.nextOffset).toBe(50);
      expect(result.comments[0].id).toBe('comment_49');
      expect(result.comments[result.comments.length - 1].id).toBe('comment_0');
      expect(result.comments[49].reactions).toEqual([
        {
          emoji: '😀',
          count: 1,
          users: [{ id: 'user_r', name: 'React User', avatarUrl: null }],
        },
      ]);
    });
  });

  describe('getPostCookedEventsPage', () => {
    it('uses default cooked limit and clamps negative offset', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getPostCookedEventsPage({
        postId: 'post_1',
        familySpaceId: 'family_1',
        offset: -3,
      });

      expect(result).toEqual({ entries: [], hasMore: false, nextOffset: 0 });
      expect(prismaMock.cookedEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 6, skip: 0 })
      );
    });

    it('returns cooked entries and hasMore flag when extra record fetched', async () => {
      const records = [
        {
          id: 'cook_2',
          rating: 3,
          note: null,
          createdAt: new Date('2024-02-02T12:00:00Z'),
          user: { id: 'user_b', name: 'Bob', avatarUrl: null },
        },
        {
          id: 'cook_1',
          rating: 4,
          note: 'Nice',
          createdAt: new Date('2024-02-01T12:00:00Z'),
          user: { id: 'user_a', name: 'Alice', avatarUrl: '/a.jpg' },
        },
      ];

      prismaMock.cookedEvent.findMany.mockResolvedValue(records as any);

      const result = await getPostCookedEventsPage({
        postId: 'post_1',
        familySpaceId: 'family_1',
        limit: 1,
        offset: 10,
      });

      expect(result.hasMore).toBe(true);
      expect(result.entries).toEqual([
        {
          id: 'cook_2',
          rating: 3,
          note: null,
          createdAt: records[0].createdAt.toISOString(),
          user: { id: 'user_b', name: 'Bob', avatarUrl: null },
        },
      ]);
      expect(result.nextOffset).toBe(11);
      expect(prismaMock.cookedEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2, skip: 10 })
      );
    });

    it('clamps cooked limit to max', async () => {
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getPostCookedEventsPage({
        postId: 'post_1',
        familySpaceId: 'family_1',
        limit: 500,
        offset: 0,
      });

      expect(prismaMock.cookedEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 })
      );
    });
  });
});
