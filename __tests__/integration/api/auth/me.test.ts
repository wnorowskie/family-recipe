import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/me/route';
import * as session from '@/lib/session';

// Mock the session module
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

describe('GET /api/auth/me', () => {
  const mockGetCurrentUser = session.getCurrentUser as jest.MockedFunction<
    typeof session.getCurrentUser
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('requires authentication (returns 401 without token)', async () => {
      // Mock getCurrentUser to return null (not authenticated)
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Not authenticated');
      expect(mockGetCurrentUser).toHaveBeenCalledWith(request);
    });
  });

  describe('Success Cases', () => {
    it('returns current user profile', async () => {
      const mockUser = {
        id: 'clq1234567890abcdef',
        name: 'Test User',
        emailOrUsername: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.jpg',
        familySpaceId: 'family_test123',
        familySpaceName: 'Test Family',
        role: 'member',
      };

      // Mock getCurrentUser to return authenticated user
      mockGetCurrentUser.mockResolvedValue(mockUser as any);

      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual(mockUser);
      expect(mockGetCurrentUser).toHaveBeenCalledWith(request);
    });

    it('handles users with different roles correctly', async () => {
      const mockOwner = {
        id: 'owner_id_123',
        name: 'Family Owner',
        emailOrUsername: 'owner@example.com',
        avatarUrl: null,
        familySpaceId: 'family_test123',
        familySpaceName: 'Test Family',
        role: 'owner',
      };

      mockGetCurrentUser.mockResolvedValue(mockOwner as any);

      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.role).toBe('owner');
      expect(data.user.avatarUrl).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles errors from getCurrentUser gracefully', async () => {
      // Mock getCurrentUser to throw an error
      mockGetCurrentUser.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/auth/me', {
        method: 'GET',
      });

      // The error should propagate (no try-catch in the route)
      await expect(GET(request)).rejects.toThrow('Database connection failed');
      expect(mockGetCurrentUser).toHaveBeenCalledWith(request);
    });
  });
});
