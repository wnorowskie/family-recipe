import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { POST } from '@/app/api/posts/[postId]/cooked/route';

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
  cookedEventLimiter: {
    getUserKey: jest.fn(() => 'user_123'),
  },
  applyRateLimit: jest.fn(() => null),
}));

jest.mock('@/lib/posts', () => ({
  getPostCookedEventsPage: jest.fn(),
}));

import { getCurrentUser } from '@/lib/session';
import { getPostCookedEventsPage } from '@/lib/posts';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockGetPostCookedEventsPage = getPostCookedEventsPage as jest.MockedFunction<
  typeof getPostCookedEventsPage
>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('POST /api/posts/[postId]/cooked', () => {
  const mockUser = {
    id: 'user_123',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  const mockContext = {
    params: { postId: 'post_123' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid post ID', async () => {
      const invalidContext = { params: { postId: '' } };

      const request = new NextRequest('http://localhost/api/posts//cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, invalidContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('BAD_REQUEST');
    });

    it('validates rating range - rejects rating < 1', async () => {
      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 0 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(prismaMock.post.findFirst).not.toHaveBeenCalled();
    });

    it('validates rating range - rejects rating > 5', async () => {
      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 6 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(prismaMock.post.findFirst).not.toHaveBeenCalled();
    });

    it('accepts valid rating (1-5)', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: 5,
        note: null,
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _avg: { rating: 5 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValue({
        entries: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      expect(prismaMock.cookedEvent.create).toHaveBeenCalledWith({
        data: {
          postId: 'post_123',
          userId: 'user_123',
          rating: 5,
          note: null,
        },
      });
    });

    it('accepts optional note', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: 4,
        note: 'Delicious!',
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _avg: { rating: 4 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValue({
        entries: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 4, note: 'Delicious!' }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      expect(prismaMock.cookedEvent.create).toHaveBeenCalledWith({
        data: {
          postId: 'post_123',
          userId: 'user_123',
          rating: 4,
          note: 'Delicious!',
        },
      });
    });

    it('accepts cooked event without rating', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: null,
        note: 'Made this today',
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _avg: { rating: null },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValue({
        entries: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ note: 'Made this today' }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      expect(prismaMock.cookedEvent.create).toHaveBeenCalledWith({
        data: {
          postId: 'post_123',
          userId: 'user_123',
          rating: null,
          note: 'Made this today',
        },
      });
    });
  });

  describe('Post Existence', () => {
    it('returns 404 for non-existent post', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/posts/post_999/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, { params: { postId: 'post_999' } });

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(prismaMock.cookedEvent.create).not.toHaveBeenCalled();
    });

    it('returns 404 for post in different family', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/posts/post_other/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, { params: { postId: 'post_other' } });

      expect(response.status).toBe(404);
      expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'post_other',
          familySpaceId: 'family_123',
        },
        select: { id: true },
      });
      expect(prismaMock.cookedEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('Success Cases', () => {
    it('creates cooked event successfully', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: 5,
        note: 'Amazing recipe!',
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _avg: { rating: 4.5 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValue({
        entries: [
          {
            id: 'cooked_123',
            rating: 5,
            note: 'Amazing recipe!',
            createdAt: new Date().toISOString(),
            user: {
              id: 'user_123',
              name: 'Test User',
              avatarUrl: null,
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, note: 'Amazing recipe!' }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      const data = await parseResponseJSON(response);
      expect(data.cookedStats.timesCooked).toBe(3);
      expect(data.cookedStats.averageRating).toBe(4.5);
      expect(data.recentCooked).toHaveLength(1);
      expect(prismaMock.cookedEvent.create).toHaveBeenCalledTimes(1);
    });

    it('allows multiple cooked events per user/post', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValueOnce({
        id: 'cooked_1',
        postId: 'post_123',
        userId: 'user_123',
        rating: 5,
        note: 'First time',
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValueOnce({
        _count: { _all: 1 },
        _avg: { rating: 5 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValueOnce({
        entries: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request1 = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5, note: 'First time' }),
      });

      const response1 = await POST(request1, mockContext);
      expect(response1.status).toBe(201);

      // Second cooked event by same user for same post
      prismaMock.cookedEvent.create.mockResolvedValueOnce({
        id: 'cooked_2',
        postId: 'post_123',
        userId: 'user_123',
        rating: 4,
        note: 'Second time',
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValueOnce({
        _count: { _all: 2 },
        _avg: { rating: 4.5 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValueOnce({
        entries: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request2 = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 4, note: 'Second time' }),
      });

      const response2 = await POST(request2, mockContext);
      expect(response2.status).toBe(201);
      expect(prismaMock.cookedEvent.create).toHaveBeenCalledTimes(2);
    });

    it('returns aggregate stats and recent cooked events', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: 5,
        note: null,
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockResolvedValue({
        _count: { _all: 10 },
        _avg: { rating: 4.2 },
      } as any);
      mockGetPostCookedEventsPage.mockResolvedValue({
        entries: [
          {
            id: 'cooked_1',
            rating: 5,
            note: 'Great!',
            createdAt: new Date().toISOString(),
            user: {
              id: 'user_1',
              name: 'User One',
              avatarUrl: null,
            },
          },
          {
            id: 'cooked_2',
            rating: 4,
            note: 'Good',
            createdAt: new Date().toISOString(),
            user: {
              id: 'user_2',
              name: 'User Two',
              avatarUrl: null,
            },
          },
        ],
        hasMore: true,
        nextOffset: 2,
      });

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      const data = await parseResponseJSON(response);
      expect(data.cookedStats).toEqual({
        timesCooked: 10,
        averageRating: 4.2,
      });
      expect(data.recentCooked).toHaveLength(2);
      expect(data.recentCookedPage).toEqual({
        hasMore: true,
        nextOffset: 2,
      });
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during post lookup', async () => {
      prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles database errors during cooked event creation', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during aggregate calculation', async () => {
      prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
      prismaMock.cookedEvent.create.mockResolvedValue({
        id: 'cooked_123',
        postId: 'post_123',
        userId: 'user_123',
        rating: 5,
        note: null,
        createdAt: new Date(),
      });
      prismaMock.cookedEvent.aggregate.mockRejectedValue(new Error('Aggregate error'));

      const request = new NextRequest('http://localhost/api/posts/post_123/cooked', {
        method: 'POST',
        body: JSON.stringify({ rating: 5 }),
      });

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
