import { NextRequest } from 'next/server';
import { GET } from '@/app/api/profile/posts/route';
import * as profile from '@/lib/profile';

// Mock the profile helper
jest.mock('@/lib/profile', () => ({
  getUserPostsForProfile: jest.fn(),
}));

// Mock getCurrentUser
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetUserPostsForProfile = profile.getUserPostsForProfile as jest.MockedFunction<
  typeof profile.getUserPostsForProfile
>;

const { getCurrentUser } = require('@/lib/session');

describe('GET /api/profile/posts', () => {
  const mockUser = {
    id: 'user_test123',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    avatarUrl: null,
    familySpaceId: 'family_test123',
    role: 'member' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(mockUser);
  });

  async function parseResponseJSON(response: Response) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  describe('Authentication', () => {
    it('requires authentication', async () => {
      getCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Pagination', () => {
    it('accepts request without query parameters (uses defaults)', async () => {
      mockGetUserPostsForProfile.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 10,
      });

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetUserPostsForProfile).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.familySpaceId,
        { limit: 20, offset: 0 }
      );
    });

    it('accepts valid limit and offset parameters', async () => {
      mockGetUserPostsForProfile.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 15,
      });

      const request = new NextRequest(
        'http://localhost/api/profile/posts?limit=5&offset=10',
        { method: 'GET' }
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetUserPostsForProfile).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.familySpaceId,
        { limit: 5, offset: 10 }
      );
    });

    it('rejects invalid limit', async () => {
      const request = new NextRequest(
        'http://localhost/api/profile/posts?limit=-1',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative offset', async () => {
      const request = new NextRequest(
        'http://localhost/api/profile/posts?offset=-5',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success Cases', () => {
    it('returns empty array when user has no posts', async () => {
      mockGetUserPostsForProfile.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toEqual([]);
      expect(data.hasMore).toBe(false);
    });

    it('returns user posts with complete data structure', async () => {
      const mockPosts = [
        {
          id: 'post_1',
          title: 'My First Recipe',
          mainPhotoUrl: '/uploads/photo1.jpg',
          createdAt: '2024-01-15T10:00:00.000Z',
          cookedStats: {
            timesCooked: 5,
            averageRating: 4.5,
          },
        },
        {
          id: 'post_2',
          title: 'Another Recipe',
          mainPhotoUrl: null,
          createdAt: '2024-01-10T10:00:00.000Z',
          cookedStats: {
            timesCooked: 0,
            averageRating: null,
          },
        },
      ];

      mockGetUserPostsForProfile.mockResolvedValue({
        items: mockPosts,
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toEqual(mockPosts);
      expect(data.items[0]).toHaveProperty('id');
      expect(data.items[0]).toHaveProperty('title');
      expect(data.items[0]).toHaveProperty('mainPhotoUrl');
      expect(data.items[0]).toHaveProperty('createdAt');
      expect(data.items[0]).toHaveProperty('cookedStats');
      expect(data.items[0].cookedStats).toHaveProperty('timesCooked');
      expect(data.items[0].cookedStats).toHaveProperty('averageRating');
    });

    it('returns pagination metadata', async () => {
      mockGetUserPostsForProfile.mockResolvedValue({
        items: Array(20).fill(null).map((_, i) => ({
          id: `post_${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: null,
          createdAt: '2024-01-15T10:00:00.000Z',
          cookedStats: { timesCooked: 0, averageRating: null },
        })),
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.hasMore).toBe(true);
      expect(data.nextOffset).toBe(20);
    });
  });

  describe('Error Handling', () => {
    it('handles errors from getUserPostsForProfile helper', async () => {
      mockGetUserPostsForProfile.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/profile/posts', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Unable to load posts');
    });
  });
});
