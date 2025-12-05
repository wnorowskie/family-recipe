import { NextRequest } from 'next/server';
import { GET } from '@/app/api/me/favorites/route';
import * as profile from '@/lib/profile';

// Mock the profile helper
jest.mock('@/lib/profile', () => ({
  getUserFavorites: jest.fn(),
}));

// Mock getCurrentUser
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetUserFavorites = profile.getUserFavorites as jest.MockedFunction<
  typeof profile.getUserFavorites
>;

const { getCurrentUser } = require('@/lib/session');

describe('GET /api/me/favorites', () => {
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

      const request = new NextRequest('http://localhost/api/me/favorites', {
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
      mockGetUserFavorites.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 10,
      });

      const request = new NextRequest('http://localhost/api/me/favorites', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetUserFavorites).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.familySpaceId,
        { limit: 20, offset: 0 }
      );
    });

    it('accepts valid limit and offset parameters', async () => {
      mockGetUserFavorites.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 15,
      });

      const request = new NextRequest(
        'http://localhost/api/me/favorites?limit=5&offset=10',
        { method: 'GET' }
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetUserFavorites).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.familySpaceId,
        { limit: 5, offset: 10 }
      );
    });

    it('rejects invalid limit', async () => {
      const request = new NextRequest(
        'http://localhost/api/me/favorites?limit=-1',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative offset', async () => {
      const request = new NextRequest(
        'http://localhost/api/me/favorites?offset=-5',
        { method: 'GET' }
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success Cases', () => {
    it('returns empty array when user has no favorites', async () => {
      mockGetUserFavorites.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/me/favorites', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toEqual([]);
      expect(data.hasMore).toBe(false);
    });

    it('returns favorites with complete data structure', async () => {
      const mockFavorites = [
        {
          id: 'fav_1',
          createdAt: '2024-01-15T10:00:00.000Z',
          post: {
            id: 'post_1',
            title: 'Chocolate Cake',
            mainPhotoUrl: '/uploads/cake.jpg',
            authorName: 'Alice Chef',
          },
        },
        {
          id: 'fav_2',
          createdAt: '2024-01-10T10:00:00.000Z',
          post: {
            id: 'post_2',
            title: 'Pasta Recipe',
            mainPhotoUrl: null,
            authorName: 'Bob Cook',
          },
        },
      ];

      mockGetUserFavorites.mockResolvedValue({
        items: mockFavorites,
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/me/favorites', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toEqual(mockFavorites);
      expect(data.items[0]).toHaveProperty('id');
      expect(data.items[0]).toHaveProperty('createdAt');
      expect(data.items[0]).toHaveProperty('post');
      expect(data.items[0].post).toHaveProperty('id');
      expect(data.items[0].post).toHaveProperty('title');
      expect(data.items[0].post).toHaveProperty('mainPhotoUrl');
      expect(data.items[0].post).toHaveProperty('authorName');
    });

    it('returns pagination metadata', async () => {
      mockGetUserFavorites.mockResolvedValue({
        items: Array(20).fill(null).map((_, i) => ({
          id: `fav_${i}`,
          createdAt: '2024-01-15T10:00:00.000Z',
          post: {
            id: `post_${i}`,
            title: `Recipe ${i}`,
            mainPhotoUrl: null,
            authorName: 'Test Author',
          },
        })),
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/me/favorites', {
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
    it('handles errors from getUserFavorites helper', async () => {
      mockGetUserFavorites.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/me/favorites', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Unable to load favorites');
    });
  });
});
