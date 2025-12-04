/**
 * Integration Tests: POST/DELETE /api/posts/[postId]/favorite
 *
 * Tests the favorite/unfavorite post endpoints with authentication,
 * post existence, idempotency, and error handling.
 */

// Mock all dependencies BEFORE imports
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mock-jwt-token'),
  })),
  jwtVerify: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: require('../../helpers/mock-prisma').prismaMock,
}));

jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
  setSessionCookie: jest.fn(),
  clearSessionCookie: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('@/lib/rateLimit', () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

// Import after mocks
import { POST, DELETE } from '@/app/api/posts/[postId]/favorite/route';
import { prismaMock } from '../../helpers/mock-prisma';
import { getCurrentUser } from '@/lib/session';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

// Helper to parse JSON response
async function parseResponseJSON(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe('POST/DELETE /api/posts/[postId]/favorite', () => {
  const mockUser = {
    id: 'user_123',
    name: 'Test User',
    emailOrUsername: 'test@example.com',
    avatarUrl: null,
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member',
  };

  const mockContext = {
    params: { postId: 'post_123' },
  };

  const mockRequest = new Request('http://localhost/api/posts/post_123/favorite', {
    method: 'POST',
  }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  describe('POST - Add Favorite', () => {
    describe('Authentication', () => {
      it('requires authentication', async () => {
        mockGetCurrentUser.mockResolvedValue(null);

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(401);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('Post Existence', () => {
      it('returns 404 for non-existent post', async () => {
        prismaMock.post.findFirst.mockResolvedValue(null);

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(404);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('NOT_FOUND');
        expect(data.error.message).toBe('Post not found');
      });

      it('returns 404 for post in different family', async () => {
        prismaMock.post.findFirst.mockResolvedValue(null);

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(404);
        expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
          where: {
            id: 'post_123',
            familySpaceId: 'family_123',
          },
          select: { id: true },
        });
      });
    });

    describe('Success Cases', () => {
      it('creates favorite for post', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.upsert.mockResolvedValue({
          id: 'fav_123',
          userId: 'user_123',
          postId: 'post_123',
          createdAt: new Date(),
        });

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(200);
        const data = await parseResponseJSON(response);
        expect(data.status).toBe('favorited');
        expect(prismaMock.favorite.upsert).toHaveBeenCalledWith({
          where: {
            userId_postId: {
              userId: 'user_123',
              postId: 'post_123',
            },
          },
          create: {
            userId: 'user_123',
            postId: 'post_123',
          },
          update: {},
        });
      });

      it('is idempotent - does not create duplicate favorites', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.upsert.mockResolvedValue({
          id: 'fav_123',
          userId: 'user_123',
          postId: 'post_123',
          createdAt: new Date(),
        });

        // First favorite
        const response1 = await POST(mockRequest, mockContext);
        expect(response1.status).toBe(200);

        // Second favorite - should still succeed without creating duplicate
        const response2 = await POST(mockRequest, mockContext);
        expect(response2.status).toBe(200);

        // Upsert ensures no duplicates are created
        expect(prismaMock.favorite.upsert).toHaveBeenCalledTimes(2);
      });
    });

    describe('Error Handling', () => {
      it('handles database errors gracefully', async () => {
        prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(500);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('INTERNAL_ERROR');
        expect(data.error.message).toBe('Unable to favorite post');
      });

      it('handles upsert errors gracefully', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.upsert.mockRejectedValue(new Error('Upsert failed'));

        const response = await POST(mockRequest, mockContext);

        expect(response.status).toBe(500);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('INTERNAL_ERROR');
      });
    });
  });

  describe('DELETE - Remove Favorite', () => {
    describe('Authentication', () => {
      it('requires authentication', async () => {
        mockGetCurrentUser.mockResolvedValue(null);

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(401);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('Post Existence', () => {
      it('returns 404 for non-existent post', async () => {
        prismaMock.post.findFirst.mockResolvedValue(null);

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(404);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('NOT_FOUND');
        expect(data.error.message).toBe('Post not found');
      });

      it('returns 404 for post in different family', async () => {
        prismaMock.post.findFirst.mockResolvedValue(null);

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(404);
        expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
          where: {
            id: 'post_123',
            familySpaceId: 'family_123',
          },
          select: { id: true },
        });
      });
    });

    describe('Success Cases', () => {
      it('removes favorite from post', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.deleteMany.mockResolvedValue({ count: 1 });

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(200);
        const data = await parseResponseJSON(response);
        expect(data.status).toBe('unfavorited');
        expect(prismaMock.favorite.deleteMany).toHaveBeenCalledWith({
          where: {
            userId: 'user_123',
            postId: 'post_123',
          },
        });
      });

      it('is idempotent - succeeds even if favorite does not exist', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.deleteMany.mockResolvedValue({ count: 0 });

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(200);
        const data = await parseResponseJSON(response);
        expect(data.status).toBe('unfavorited');
      });
    });

    describe('Error Handling', () => {
      it('handles database errors gracefully', async () => {
        prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(500);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('INTERNAL_ERROR');
        expect(data.error.message).toBe('Unable to remove favorite');
      });

      it('handles delete errors gracefully', async () => {
        prismaMock.post.findFirst.mockResolvedValue({ id: 'post_123' } as any);
        prismaMock.favorite.deleteMany.mockRejectedValue(new Error('Delete failed'));

        const response = await DELETE(mockRequest, mockContext);

        expect(response.status).toBe(500);
        const data = await parseResponseJSON(response);
        expect(data.error.code).toBe('INTERNAL_ERROR');
      });
    });
  });
});
