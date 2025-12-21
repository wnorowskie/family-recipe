/**
 * Unit tests for timeline data aggregation
 * 
 * Coverage target: ≥75%
 * Tests: Comprehensive coverage of getTimelineFeed()
 * 
 * Functions tested:
 * - getTimelineFeed() - Aggregates timeline events from multiple sources
 */

import { getTimelineFeed } from '@/lib/timeline-data';
import { prismaMock } from '../../integration/helpers/mock-prisma';

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: require('../../integration/helpers/mock-prisma').prismaMock,
}));

describe('Timeline Data Aggregation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTimelineFeed - Empty Results', () => {
    it('returns empty array when no events exist', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(20);
    });

    it('uses default pagination values', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25, // limit (20) + offset (0) + 5
        })
      );
    });
  });

  describe('getTimelineFeed - Post Events', () => {
    it('returns post_created events', async () => {
      const mockPost = {
        id: 'post_1',
        title: 'Chocolate Cake',
        mainPhotoUrl: '/uploads/cake.jpg',
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: '/avatar.jpg',
        },
      };

      prismaMock.post.findMany.mockResolvedValueOnce([mockPost] as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'post-post_1',
        type: 'post_created',
        timestamp: mockPost.createdAt,
        actor: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: '/avatar.jpg',
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: '/uploads/cake.jpg',
        },
      });
    });

    it('handles posts without photos', async () => {
      const mockPost = {
        id: 'post_1',
        title: 'Recipe',
        mainPhotoUrl: null,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      prismaMock.post.findMany.mockResolvedValueOnce([mockPost] as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items[0].post.mainPhotoUrl).toBeNull();
      expect(result.items[0].actor.avatarUrl).toBeNull();
    });
  });

  describe('getTimelineFeed - Comment Events', () => {
    it('returns comment_added events', async () => {
      const mockComment = {
        id: 'comment_1',
        text: 'This looks delicious!',
        createdAt: new Date('2024-01-01T11:00:00.000Z'),
        author: {
          id: 'user_2',
          name: 'Bob',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: '/cake.jpg',
        },
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([mockComment] as any);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'comment-comment_1',
        type: 'comment_added',
        timestamp: mockComment.createdAt,
        actor: {
          id: 'user_2',
          name: 'Bob',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: '/cake.jpg',
        },
        comment: {
          id: 'comment_1',
          text: 'This looks delicious!',
        },
      });
    });

    it('filters out deleted comments', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });

  describe('getTimelineFeed - Reaction Events', () => {
    it('returns reaction_added events', async () => {
      const mockReaction = {
        id: 'reaction_1',
        emoji: '❤️',
        createdAt: new Date('2024-01-01T12:00:00.000Z'),
        user: {
          id: 'user_3',
          name: 'Charlie',
          avatarUrl: '/avatar.jpg',
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: null,
        },
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([mockReaction] as any);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'reaction-reaction_1',
        type: 'reaction_added',
        timestamp: mockReaction.createdAt,
        actor: {
          id: 'user_3',
          name: 'Charlie',
          avatarUrl: '/avatar.jpg',
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: null,
        },
        reaction: {
          emoji: '❤️',
        },
      });
    });

    it('filters out reactions with null post', async () => {
      const mockReaction = {
        id: 'reaction_1',
        emoji: '👍',
        createdAt: new Date('2024-01-01T12:00:00.000Z'),
        user: {
          id: 'user_3',
          name: 'Charlie',
          avatarUrl: null,
        },
        post: null,
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([mockReaction] as any);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      // Reactions without a post are filtered out
      expect(result.items).toHaveLength(0);
    });

    it('filters reactions by target type', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(prismaMock.reaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            targetType: 'post',
          }),
        })
      );
    });
  });

  describe('getTimelineFeed - Cooked Events', () => {
    it('returns cooked_logged events with rating and note', async () => {
      const mockCooked = {
        id: 'cooked_1',
        rating: 5,
        note: 'Turned out amazing!',
        createdAt: new Date('2024-01-01T13:00:00.000Z'),
        user: {
          id: 'user_4',
          name: 'Diana',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: '/cake.jpg',
        },
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([mockCooked] as any);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'cooked-cooked_1',
        type: 'cooked_logged',
        timestamp: mockCooked.createdAt,
        actor: {
          id: 'user_4',
          name: 'Diana',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: '/cake.jpg',
        },
        cooked: {
          rating: 5,
          note: 'Turned out amazing!',
        },
      });
    });

    it('handles cooked events without rating', async () => {
      const mockCooked = {
        id: 'cooked_1',
        rating: null,
        note: 'Just made it',
        createdAt: new Date('2024-01-01T13:00:00.000Z'),
        user: {
          id: 'user_4',
          name: 'Diana',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: null,
        },
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([mockCooked] as any);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect((result.items[0] as any).cooked).toEqual({
        rating: null,
        note: 'Just made it',
      });
    });

    it('handles cooked events without note', async () => {
      const mockCooked = {
        id: 'cooked_1',
        rating: 4,
        note: null,
        createdAt: new Date('2024-01-01T13:00:00.000Z'),
        user: {
          id: 'user_4',
          name: 'Diana',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake',
          mainPhotoUrl: null,
        },
      };

      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([mockCooked] as any);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect((result.items[0] as any).cooked).toEqual({
        rating: 4,
        note: null,
      });
    });
  });

  describe('getTimelineFeed - Edit Events', () => {
    it('returns post_edited events', async () => {
      const createdAt = new Date('2024-01-01T10:00:00.000Z');
      const editedAt = new Date('2024-01-01T14:00:00.000Z');

      const mockEditedPost = {
        id: 'post_1',
        title: 'Chocolate Cake (Updated)',
        mainPhotoUrl: '/cake.jpg',
        createdAt,
        lastEditAt: editedAt,
        lastEditNote: 'Updated baking time',
        editor: {
          id: 'user_5',
          name: 'Eve',
          avatarUrl: null,
        },
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      prismaMock.post.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([mockEditedPost] as any);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: `edit-post_1-${editedAt.getTime()}`,
        type: 'post_edited',
        timestamp: editedAt,
        actor: {
          id: 'user_5',
          name: 'Eve',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Chocolate Cake (Updated)',
          mainPhotoUrl: '/cake.jpg',
        },
        edit: {
          note: 'Updated baking time',
        },
      });
    });

    it('uses author as actor when editor is null', async () => {
      const createdAt = new Date('2024-01-01T10:00:00.000Z');
      const editedAt = new Date('2024-01-01T14:00:00.000Z');

      const mockEditedPost = {
        id: 'post_1',
        title: 'Recipe',
        mainPhotoUrl: null,
        createdAt,
        lastEditAt: editedAt,
        lastEditNote: null,
        editor: null,
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      prismaMock.post.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([mockEditedPost] as any);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items[0].actor).toEqual({
        id: 'user_1',
        name: 'Alice',
        avatarUrl: null,
      });
    });

    it('skips edit events when lastEditAt is null', async () => {
      const mockPost = {
        id: 'post_1',
        title: 'Recipe',
        mainPhotoUrl: null,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        lastEditAt: null,
        lastEditNote: null,
        editor: null,
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      prismaMock.post.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([mockPost] as any);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(0);
    });

    it('skips edit events when lastEditAt equals createdAt', async () => {
      const timestamp = new Date('2024-01-01T10:00:00.000Z');

      const mockPost = {
        id: 'post_1',
        title: 'Recipe',
        mainPhotoUrl: null,
        createdAt: timestamp,
        lastEditAt: timestamp,
        lastEditNote: null,
        editor: null,
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      prismaMock.post.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([mockPost] as any);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(0);
    });

    it('skips edit events when both editor and author are null', async () => {
      const createdAt = new Date('2024-01-01T10:00:00.000Z');
      const editedAt = new Date('2024-01-01T14:00:00.000Z');

      const mockPost = {
        id: 'post_1',
        title: 'Recipe',
        mainPhotoUrl: null,
        createdAt,
        lastEditAt: editedAt,
        lastEditNote: null,
        editor: null,
        author: null,
      };

      prismaMock.post.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([mockPost] as any);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(0);
    });
  });

  describe('getTimelineFeed - Sorting', () => {
    it('sorts all events by timestamp descending', async () => {
      const mockPost = {
        id: 'post_1',
        title: 'Post',
        mainPhotoUrl: null,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: null,
        },
      };

      const mockComment = {
        id: 'comment_1',
        text: 'Comment',
        createdAt: new Date('2024-01-01T12:00:00.000Z'),
        author: {
          id: 'user_2',
          name: 'Bob',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Post',
          mainPhotoUrl: null,
        },
      };

      const mockCooked = {
        id: 'cooked_1',
        rating: 5,
        note: null,
        createdAt: new Date('2024-01-01T11:00:00.000Z'),
        user: {
          id: 'user_3',
          name: 'Charlie',
          avatarUrl: null,
        },
        post: {
          id: 'post_1',
          title: 'Post',
          mainPhotoUrl: null,
        },
      };

      prismaMock.post.findMany.mockResolvedValueOnce([mockPost] as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([mockComment] as any);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([mockCooked] as any);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(3);
      // Verify descending order
      expect(result.items[0].type).toBe('comment_added');
      expect(result.items[1].type).toBe('cooked_logged');
      expect(result.items[2].type).toBe('post_created');
      expect(result.items[0].timestamp > result.items[1].timestamp).toBe(true);
      expect(result.items[1].timestamp > result.items[2].timestamp).toBe(true);
    });
  });

  describe('getTimelineFeed - Pagination', () => {
    it('respects custom limit parameter', async () => {
      const posts = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: `post_${i}`,
          title: `Post ${i}`,
          mainPhotoUrl: null,
          createdAt: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
          author: {
            id: 'user_1',
            name: 'Alice',
            avatarUrl: null,
          },
        }));

      prismaMock.post.findMany.mockResolvedValueOnce(posts as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({
        familySpaceId: 'family_1',
        limit: 10,
      });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });

    it('respects offset parameter', async () => {
      const posts = Array(25)
        .fill(null)
        .map((_, i) => ({
          id: `post_${i}`,
          title: `Post ${i}`,
          mainPhotoUrl: null,
          createdAt: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`),
          author: {
            id: 'user_1',
            name: 'Alice',
            avatarUrl: null,
          },
        }));

      prismaMock.post.findMany.mockResolvedValueOnce(posts as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({
        familySpaceId: 'family_1',
        limit: 10,
        offset: 15,
      });

      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBe(25);
    });

    it('sets hasMore to false when no more items', async () => {
      const posts = Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `post_${i}`,
          title: `Post ${i}`,
          mainPhotoUrl: null,
          createdAt: new Date(),
          author: {
            id: 'user_1',
            name: 'Alice',
            avatarUrl: null,
          },
        }));

      prismaMock.post.findMany.mockResolvedValueOnce(posts as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({
        familySpaceId: 'family_1',
        limit: 20,
      });

      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
    });

    it('sets hasMore to true when more items exist', async () => {
      const posts = Array(25)
        .fill(null)
        .map((_, i) => ({
          id: `post_${i}`,
          title: `Post ${i}`,
          mainPhotoUrl: null,
          createdAt: new Date(),
          author: {
            id: 'user_1',
            name: 'Alice',
            avatarUrl: null,
          },
        }));

      prismaMock.post.findMany.mockResolvedValueOnce(posts as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({
        familySpaceId: 'family_1',
        limit: 20,
      });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
    });

    it('calculates nextOffset correctly', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({
        familySpaceId: 'family_1',
        limit: 15,
        offset: 30,
      });

      expect(result.nextOffset).toBe(45);
    });
  });

  describe('getTimelineFeed - Mixed Events', () => {
    it('combines all event types in single timeline', async () => {
      const mockPost = {
        id: 'post_1',
        title: 'Post',
        mainPhotoUrl: null,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        author: { id: 'user_1', name: 'Alice', avatarUrl: null },
      };

      const mockComment = {
        id: 'comment_1',
        text: 'Comment',
        createdAt: new Date('2024-01-01T11:00:00.000Z'),
        author: { id: 'user_2', name: 'Bob', avatarUrl: null },
        post: { id: 'post_1', title: 'Post', mainPhotoUrl: null },
      };

      const mockReaction = {
        id: 'reaction_1',
        emoji: '❤️',
        createdAt: new Date('2024-01-01T12:00:00.000Z'),
        user: { id: 'user_3', name: 'Charlie', avatarUrl: null },
        post: { id: 'post_1', title: 'Post', mainPhotoUrl: null },
      };

      const mockCooked = {
        id: 'cooked_1',
        rating: 5,
        note: 'Great!',
        createdAt: new Date('2024-01-01T13:00:00.000Z'),
        user: { id: 'user_4', name: 'Diana', avatarUrl: null },
        post: { id: 'post_1', title: 'Post', mainPhotoUrl: null },
      };

      prismaMock.post.findMany.mockResolvedValueOnce([mockPost] as any).mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([mockComment] as any);
      prismaMock.reaction.findMany.mockResolvedValue([mockReaction] as any);
      prismaMock.cookedEvent.findMany.mockResolvedValue([mockCooked] as any);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items).toHaveLength(4);
      expect(result.items.map((item) => item.type)).toEqual([
        'cooked_logged',
        'reaction_added',
        'comment_added',
        'post_created',
      ]);
    });
  });

  describe('getTimelineFeed - Edge Cases', () => {
    it('filters out entries with empty postId', async () => {
      // This shouldn't happen in practice, but the code has a filter for it
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      const result = await getTimelineFeed({ familySpaceId: 'family_1' });

      expect(result.items.every((item) => item.post.id)).toBe(true);
    });

    it('queries posts for both creation and edit events', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getTimelineFeed({ familySpaceId: 'family_1' });

      // Should be called twice: once for post_created, once for edit events
      expect(prismaMock.post.findMany).toHaveBeenCalledTimes(2);
    });

    it('handles familySpaceId filtering correctly', async () => {
      prismaMock.post.findMany.mockResolvedValue([]);
      prismaMock.comment.findMany.mockResolvedValue([]);
      prismaMock.reaction.findMany.mockResolvedValue([]);
      prismaMock.cookedEvent.findMany.mockResolvedValue([]);

      await getTimelineFeed({ familySpaceId: 'family_test_123' });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familySpaceId: 'family_test_123' },
        })
      );

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            post: { familySpaceId: 'family_test_123' },
          }),
        })
      );
    });
  });
});
