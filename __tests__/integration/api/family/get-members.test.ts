import { NextRequest } from 'next/server';
import { GET } from '@/app/api/family/members/route';
import * as family from '@/lib/family';

// Mock the family helper
jest.mock('@/lib/family', () => ({
  getFamilyMembers: jest.fn(),
}));

// Mock getCurrentUser
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetFamilyMembers = family.getFamilyMembers as jest.MockedFunction<
  typeof family.getFamilyMembers
>;

const { getCurrentUser } = require('@/lib/session');

describe('GET /api/family/members', () => {
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

      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Success Cases', () => {
    it('returns empty array when family has no members', async () => {
      mockGetFamilyMembers.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.members).toEqual([]);
      expect(mockGetFamilyMembers).toHaveBeenCalledWith(mockUser.familySpaceId);
    });

    it('returns family members with complete data structure', async () => {
      const mockMembers = [
        {
          userId: 'user_1',
          membershipId: 'membership_1',
          name: 'Alice Owner',
          emailOrUsername: 'alice@example.com',
          avatarUrl: '/uploads/alice.jpg',
          role: 'owner',
          joinedAt: '2024-01-01T00:00:00.000Z',
          postCount: 25,
        },
        {
          userId: 'user_2',
          membershipId: 'membership_2',
          name: 'Bob Member',
          emailOrUsername: 'bob@example.com',
          avatarUrl: null,
          role: 'member',
          joinedAt: '2024-01-15T00:00:00.000Z',
          postCount: 10,
        },
        {
          userId: 'user_3',
          membershipId: 'membership_3',
          name: 'Carol Admin',
          emailOrUsername: 'carol@example.com',
          avatarUrl: '/uploads/carol.jpg',
          role: 'admin',
          joinedAt: '2024-02-01T00:00:00.000Z',
          postCount: 5,
        },
      ];

      mockGetFamilyMembers.mockResolvedValue(mockMembers);

      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.members).toEqual(mockMembers);
      expect(data.members).toHaveLength(3);
      
      // Verify data structure
      expect(data.members[0]).toHaveProperty('userId');
      expect(data.members[0]).toHaveProperty('membershipId');
      expect(data.members[0]).toHaveProperty('name');
      expect(data.members[0]).toHaveProperty('emailOrUsername');
      expect(data.members[0]).toHaveProperty('avatarUrl');
      expect(data.members[0]).toHaveProperty('role');
      expect(data.members[0]).toHaveProperty('joinedAt');
      expect(data.members[0]).toHaveProperty('postCount');
    });

    it('includes all role types (owner, admin, member)', async () => {
      const mockMembers = [
        {
          userId: 'user_1',
          membershipId: 'membership_1',
          name: 'Owner User',
          emailOrUsername: 'owner@example.com',
          avatarUrl: null,
          role: 'owner',
          joinedAt: '2024-01-01T00:00:00.000Z',
          postCount: 10,
        },
        {
          userId: 'user_2',
          membershipId: 'membership_2',
          name: 'Admin User',
          emailOrUsername: 'admin@example.com',
          avatarUrl: null,
          role: 'admin',
          joinedAt: '2024-01-02T00:00:00.000Z',
          postCount: 5,
        },
        {
          userId: 'user_3',
          membershipId: 'membership_3',
          name: 'Member User',
          emailOrUsername: 'member@example.com',
          avatarUrl: null,
          role: 'member',
          joinedAt: '2024-01-03T00:00:00.000Z',
          postCount: 3,
        },
      ];

      mockGetFamilyMembers.mockResolvedValue(mockMembers);

      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.members[0].role).toBe('owner');
      expect(data.members[1].role).toBe('admin');
      expect(data.members[2].role).toBe('member');
    });
  });

  describe('Error Handling', () => {
    it('handles errors from getFamilyMembers helper', async () => {
      mockGetFamilyMembers.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/family/members', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Unable to load family members');
    });
  });
});
