import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { POST } from '@/app/api/reactions/route';

// Mock dependencies
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: require('../../helpers/mock-prisma').prismaMock,
}));

jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('@/lib/rateLimit', () => ({
  reactionLimiter: {
    getUserKey: jest.fn(() => 'user_123'),
  },
  applyRateLimit: jest.fn(() => null),
}));

import { getCurrentUser } from '@/lib/session';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('POST /api/reactions', () => {
  const mockUser = {
    id: 'user_123',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('requires targetType', async () => {
      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires targetId', async () => {
      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires emoji', async () => {
      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates targetType enum', async () => {
      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'invalid',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts valid targetType: post', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({
        id: 'reaction_1',
        targetType: 'post',
        targetId: 'clh0000000000000000000001',
        emoji: '👍',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('accepts valid targetType: comment', async () => {
      prismaMock.comment.findFirst.mockResolvedValue({ id: 'clh0000000000000000000101' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({
        id: 'reaction_1',
        targetType: 'comment',
        targetId: 'clh0000000000000000000101',
        emoji: '👍',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: 'clh0000000000000000000101',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Target Existence', () => {
    it('returns 404 for non-existent post', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000999',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toBe('Post not found');
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    });

    it('returns 404 for post in different family', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000002',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clh0000000000000000000002',
          familySpaceId: 'family_123',
        },
        select: { id: true },
      });
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    });

    it('returns 404 for non-existent comment', async () => {
      prismaMock.comment.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: 'clh0000000000000000000999',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toBe('Comment not found');
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    });

    it('returns 404 for comment in different family', async () => {
      prismaMock.comment.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: 'clh0000000000000000000102',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      expect(prismaMock.comment.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clh0000000000000000000102',
          post: { familySpaceId: 'family_123' },
        },
        select: { id: true },
      });
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    });
  });

  describe('Success Cases - Create Reaction', () => {
    it('creates reaction for post', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({
        id: 'reaction_1',
        targetType: 'post',
        targetId: 'clh0000000000000000000001',
        emoji: '❤️',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.findMany.mockResolvedValue([
        {
          id: 'reaction_1',
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '❤️',
          userId: 'user_123',
          createdAt: new Date(),
          user: {
            id: 'user_123',
            name: 'Test User',
            avatarUrl: null,
          },
        },
      ] as any);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '❤️',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.reactions).toHaveLength(1);
      expect(data.reactions[0]).toEqual({
        emoji: '❤️',
        count: 1,
        users: [
          {
            id: 'user_123',
            name: 'Test User',
            avatarUrl: null,
          },
        ],
      });
      expect(prismaMock.reaction.create).toHaveBeenCalledWith({
        data: {
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '❤️',
          userId: 'user_123',
        },
      });
    });

    it('creates reaction for comment', async () => {
      prismaMock.comment.findFirst.mockResolvedValue({ id: 'clh0000000000000000000101' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({
        id: 'reaction_1',
        targetType: 'comment',
        targetId: 'clh0000000000000000000101',
        emoji: '😂',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.findMany.mockResolvedValue([
        {
          id: 'reaction_1',
          targetType: 'comment',
          targetId: 'clh0000000000000000000101',
          emoji: '😂',
          userId: 'user_123',
          createdAt: new Date(),
          user: {
            id: 'user_123',
            name: 'Test User',
            avatarUrl: null,
          },
        },
      ] as any);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: 'clh0000000000000000000101',
          emoji: '😂',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.reactions).toHaveLength(1);
      expect(data.reactions[0].emoji).toBe('😂');
      expect(prismaMock.reaction.create).toHaveBeenCalledWith({
        data: {
          targetType: 'comment',
          targetId: 'clh0000000000000000000101',
          emoji: '😂',
          userId: 'user_123',
        },
      });
    });

    it('returns reaction summary with multiple reactions', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({} as any);
      prismaMock.reaction.findMany.mockResolvedValue([
        {
          emoji: '👍',
          userId: 'user_1',
          createdAt: new Date(),
          user: { id: 'user_1', name: 'User One', avatarUrl: null },
        },
        {
          emoji: '👍',
          userId: 'user_2',
          createdAt: new Date(),
          user: { id: 'user_2', name: 'User Two', avatarUrl: null },
        },
        {
          emoji: '❤️',
          userId: 'user_3',
          createdAt: new Date(),
          user: { id: 'user_3', name: 'User Three', avatarUrl: null },
        },
      ] as any);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '🔥',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.reactions).toHaveLength(2);
      
      const thumbsUp = data.reactions.find((r: any) => r.emoji === '👍');
      expect(thumbsUp.count).toBe(2);
      expect(thumbsUp.users).toHaveLength(2);
      
      const heart = data.reactions.find((r: any) => r.emoji === '❤️');
      expect(heart.count).toBe(1);
      expect(heart.users).toHaveLength(1);
    });
  });

  describe('Success Cases - Toggle Reaction (Remove)', () => {
    it('removes existing reaction when toggled', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue({
        id: 'reaction_existing',
        targetType: 'post',
        targetId: 'clh0000000000000000000001',
        emoji: '👍',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.delete.mockResolvedValue({} as any);
      prismaMock.reaction.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.reactions).toHaveLength(0);
      expect(prismaMock.reaction.delete).toHaveBeenCalledWith({
        where: { id: 'reaction_existing' },
      });
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    });

    it('removes reaction and returns updated summary', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue({
        id: 'reaction_user123',
        targetType: 'post',
        targetId: 'clh0000000000000000000001',
        emoji: '👍',
        userId: 'user_123',
        createdAt: new Date(),
      } as any);
      prismaMock.reaction.delete.mockResolvedValue({} as any);
      // After removal, only other user's reaction remains
      prismaMock.reaction.findMany.mockResolvedValue([
        {
          emoji: '👍',
          userId: 'user_other',
          createdAt: new Date(),
          user: { id: 'user_other', name: 'Other User', avatarUrl: null },
        },
      ] as any);

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.reactions).toHaveLength(1);
      expect(data.reactions[0].count).toBe(1);
      expect(data.reactions[0].users[0].id).toBe('user_other');
    });

    it('user can toggle reaction multiple times', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);

      // First toggle - add reaction
      prismaMock.reaction.findFirst.mockResolvedValueOnce(null);
      prismaMock.reaction.create.mockResolvedValueOnce({} as any);
      prismaMock.reaction.findMany.mockResolvedValueOnce([
        {
          emoji: '❤️',
          userId: 'user_123',
          createdAt: new Date(),
          user: { id: 'user_123', name: 'Test User', avatarUrl: null },
        },
      ] as any);

      const request1 = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '❤️',
        }),
      });

      const response1 = await POST(request1);
      expect(response1.status).toBe(200);
      const data1 = await parseResponseJSON(response1);
      expect(data1.reactions).toHaveLength(1);

      // Second toggle - remove reaction
      prismaMock.reaction.findFirst.mockResolvedValueOnce({
        id: 'reaction_123',
        emoji: '❤️',
        userId: 'user_123',
      } as any);
      prismaMock.reaction.delete.mockResolvedValueOnce({} as any);
      prismaMock.reaction.findMany.mockResolvedValueOnce([]);

      const request2 = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '❤️',
        }),
      });

      const response2 = await POST(request2);
      expect(response2.status).toBe(200);
      const data2 = await parseResponseJSON(response2);
      expect(data2.reactions).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during target lookup', async () => {
      prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during reaction creation', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockRejectedValue(new Error('Create error'));

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during reaction deletion', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue({
        id: 'reaction_existing',
        emoji: '👍',
      } as any);
      prismaMock.reaction.delete.mockRejectedValue(new Error('Delete error'));

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during summary building', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'clh0000000000000000000001' } as any);
      prismaMock.reaction.findFirst.mockResolvedValue(null);
      prismaMock.reaction.create.mockResolvedValue({} as any);
      prismaMock.reaction.findMany.mockRejectedValue(new Error('Summary error'));

      const request = new NextRequest('http://localhost/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'post',
          targetId: 'clh0000000000000000000001',
          emoji: '👍',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
