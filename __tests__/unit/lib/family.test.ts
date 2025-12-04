/**
 * Unit Tests: Family Utilities
 *
 * Tests for family member management functions in src/lib/family.ts
 *
 * Coverage:
 * - getFamilyMembers() - retrieves and formats family members
 * - removeFamilyMember() - removes non-owner members
 */

import { getFamilyMembers, removeFamilyMember } from '@/lib/family';
import { prisma } from '@/lib/prisma';

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    familyMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockFindMany = prisma.familyMembership.findMany as jest.MockedFunction<
  typeof prisma.familyMembership.findMany
>;
const mockFindFirst = prisma.familyMembership.findFirst as jest.MockedFunction<
  typeof prisma.familyMembership.findFirst
>;
const mockDelete = prisma.familyMembership.delete as jest.MockedFunction<
  typeof prisma.familyMembership.delete
>;

describe('Family Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFamilyMembers()', () => {
    const familySpaceId = 'family_123';

    it('returns empty array when no members exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getFamilyMembers(familySpaceId);

      expect(result).toEqual([]);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { familySpaceId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              emailOrUsername: true,
              avatarUrl: true,
              posts: { select: { id: true } },
            },
          },
        },
      });
    });

    it('returns formatted member data for single member', async () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'owner',
          createdAt: mockDate,
          user: {
            id: 'user_1',
            name: 'Alice Owner',
            emailOrUsername: 'alice@example.com',
            avatarUrl: 'https://example.com/avatar1.jpg',
            posts: [{ id: 'post_1' }, { id: 'post_2' }, { id: 'post_3' }],
          },
        } as any,
      ]);

      const result = await getFamilyMembers(familySpaceId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: 'user_1',
        membershipId: 'membership_1',
        name: 'Alice Owner',
        emailOrUsername: 'alice@example.com',
        avatarUrl: 'https://example.com/avatar1.jpg',
        role: 'owner',
        joinedAt: '2025-01-15T10:00:00.000Z',
        postCount: 3,
      });
    });

    it('returns formatted member data for multiple members', async () => {
      const date1 = new Date('2025-01-15T10:00:00Z');
      const date2 = new Date('2025-01-20T14:30:00Z');
      const date3 = new Date('2025-02-01T08:15:00Z');

      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'owner',
          createdAt: date1,
          user: {
            id: 'user_1',
            name: 'Alice Owner',
            emailOrUsername: 'alice@example.com',
            avatarUrl: 'https://example.com/avatar1.jpg',
            posts: [{ id: 'post_1' }, { id: 'post_2' }],
          },
        },
        {
          id: 'membership_2',
          userId: 'user_2',
          familySpaceId,
          role: 'member',
          createdAt: date2,
          user: {
            id: 'user_2',
            name: 'Bob Member',
            emailOrUsername: 'bob@example.com',
            avatarUrl: null,
            posts: [{ id: 'post_3' }],
          },
        },
        {
          id: 'membership_3',
          userId: 'user_3',
          familySpaceId,
          role: 'member',
          createdAt: date3,
          user: {
            id: 'user_3',
            name: 'Carol Member',
            emailOrUsername: 'carol@example.com',
            avatarUrl: 'https://example.com/avatar3.jpg',
            posts: [],
          },
        },
      ] as any);

      const result = await getFamilyMembers(familySpaceId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        userId: 'user_1',
        membershipId: 'membership_1',
        name: 'Alice Owner',
        emailOrUsername: 'alice@example.com',
        avatarUrl: 'https://example.com/avatar1.jpg',
        role: 'owner',
        joinedAt: '2025-01-15T10:00:00.000Z',
        postCount: 2,
      });
      expect(result[1]).toEqual({
        userId: 'user_2',
        membershipId: 'membership_2',
        name: 'Bob Member',
        emailOrUsername: 'bob@example.com',
        avatarUrl: null,
        role: 'member',
        joinedAt: '2025-01-20T14:30:00.000Z',
        postCount: 1,
      });
      expect(result[2]).toEqual({
        userId: 'user_3',
        membershipId: 'membership_3',
        name: 'Carol Member',
        emailOrUsername: 'carol@example.com',
        avatarUrl: 'https://example.com/avatar3.jpg',
        role: 'member',
        joinedAt: '2025-02-01T08:15:00.000Z',
        postCount: 0,
      });
    });

    it('handles members with null avatarUrl', async () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'member',
          createdAt: mockDate,
          user: {
            id: 'user_1',
            name: 'No Avatar User',
            emailOrUsername: 'noavatar@example.com',
            avatarUrl: null,
            posts: [],
          },
        } as any,
      ]);

      const result = await getFamilyMembers(familySpaceId);

      expect(result[0].avatarUrl).toBeNull();
    });

    it('handles members with zero posts', async () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'member',
          createdAt: mockDate,
          user: {
            id: 'user_1',
            name: 'New User',
            emailOrUsername: 'newuser@example.com',
            avatarUrl: null,
            posts: [],
          },
        } as any,
      ]);

      const result = await getFamilyMembers(familySpaceId);

      expect(result[0].postCount).toBe(0);
    });

    it('handles members with many posts', async () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      const manyPosts = Array.from({ length: 50 }, (_, i) => ({ id: `post_${i + 1}` }));

      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'member',
          createdAt: mockDate,
          user: {
            id: 'user_1',
            name: 'Prolific User',
            emailOrUsername: 'prolific@example.com',
            avatarUrl: null,
            posts: manyPosts,
          },
        } as any,
      ]);

      const result = await getFamilyMembers(familySpaceId);

      expect(result[0].postCount).toBe(50);
    });

    it('preserves ordering by createdAt ascending', async () => {
      const date1 = new Date('2025-01-15T10:00:00Z');
      const date2 = new Date('2025-01-10T10:00:00Z'); // Earlier date
      const date3 = new Date('2025-01-20T10:00:00Z'); // Later date

      mockFindMany.mockResolvedValue([
        {
          id: 'membership_2',
          userId: 'user_2',
          familySpaceId,
          role: 'member',
          createdAt: date2,
          user: {
            id: 'user_2',
            name: 'First Member',
            emailOrUsername: 'first@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'owner',
          createdAt: date1,
          user: {
            id: 'user_1',
            name: 'Second Member',
            emailOrUsername: 'second@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
        {
          id: 'membership_3',
          userId: 'user_3',
          familySpaceId,
          role: 'member',
          createdAt: date3,
          user: {
            id: 'user_3',
            name: 'Third Member',
            emailOrUsername: 'third@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
      ] as any);

      const result = await getFamilyMembers(familySpaceId);

      // Results should maintain the order returned by Prisma (ordered by createdAt asc)
      expect(result[0].name).toBe('First Member');
      expect(result[1].name).toBe('Second Member');
      expect(result[2].name).toBe('Third Member');
    });

    it('handles Prisma query errors', async () => {
      mockFindMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(getFamilyMembers(familySpaceId)).rejects.toThrow('Database connection failed');
    });
  });

  describe('removeFamilyMember()', () => {
    const familySpaceId = 'family_123';
    const targetUserId = 'user_2';

    it('returns removed: false when membership not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await removeFamilyMember(familySpaceId, targetUserId);

      expect(result).toEqual({ removed: false });
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          familySpaceId,
          userId: targetUserId,
        },
        select: {
          id: true,
          role: true,
        },
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('throws error when trying to remove owner', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'membership_1',
        role: 'owner',
      } as any);

      await expect(removeFamilyMember(familySpaceId, targetUserId)).rejects.toThrow(
        'CANNOT_REMOVE_OWNER'
      );

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('successfully removes member role', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'membership_2',
        role: 'member',
      } as any);

      mockDelete.mockResolvedValue({} as any);

      const result = await removeFamilyMember(familySpaceId, targetUserId);

      expect(result).toEqual({ removed: true });
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'membership_2' },
      });
    });

    it('successfully removes admin role', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'membership_3',
        role: 'admin',
      } as any);

      mockDelete.mockResolvedValue({} as any);

      const result = await removeFamilyMember(familySpaceId, targetUserId);

      expect(result).toEqual({ removed: true });
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'membership_3' },
      });
    });

    it('handles different user IDs correctly', async () => {
      const userId1 = 'user_100';
      const userId2 = 'user_200';

      mockFindFirst
        .mockResolvedValueOnce({
          id: 'membership_100',
          role: 'member',
        } as any)
        .mockResolvedValueOnce({
          id: 'membership_200',
          role: 'member',
        } as any);

      mockDelete.mockResolvedValue({} as any);

      await removeFamilyMember(familySpaceId, userId1);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { familySpaceId, userId: userId1 },
        select: { id: true, role: true },
      });

      await removeFamilyMember(familySpaceId, userId2);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { familySpaceId, userId: userId2 },
        select: { id: true, role: true },
      });
    });

    it('handles Prisma findFirst errors', async () => {
      mockFindFirst.mockRejectedValue(new Error('Database query failed'));

      await expect(removeFamilyMember(familySpaceId, targetUserId)).rejects.toThrow(
        'Database query failed'
      );
    });

    it('handles Prisma delete errors', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'membership_2',
        role: 'member',
      } as any);

      mockDelete.mockRejectedValue(new Error('Cascade delete failed'));

      await expect(removeFamilyMember(familySpaceId, targetUserId)).rejects.toThrow(
        'Cascade delete failed'
      );
    });
  });

  describe('Type Safety', () => {
    it('FamilyMemberSummary interface matches return type', async () => {
      const mockDate = new Date('2025-01-15T10:00:00Z');
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId: 'family_123',
          role: 'owner',
          createdAt: mockDate,
          user: {
            id: 'user_1',
            name: 'Test User',
            emailOrUsername: 'test@example.com',
            avatarUrl: null,
            posts: [],
          },
        } as any,
      ]);

      const result = await getFamilyMembers('family_123');

      // Type assertions to verify structure matches interface
      const member = result[0];
      expect(typeof member.userId).toBe('string');
      expect(typeof member.membershipId).toBe('string');
      expect(typeof member.name).toBe('string');
      expect(typeof member.emailOrUsername).toBe('string');
      expect(member.avatarUrl === null || typeof member.avatarUrl === 'string').toBe(true);
      expect(typeof member.role).toBe('string');
      expect(typeof member.joinedAt).toBe('string');
      expect(typeof member.postCount).toBe('number');
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete family management workflow', async () => {
      const familySpaceId = 'family_123';

      // 1. Get members (initially has 2)
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'owner',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          user: {
            id: 'user_1',
            name: 'Owner',
            emailOrUsername: 'owner@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
        {
          id: 'membership_2',
          userId: 'user_2',
          familySpaceId,
          role: 'member',
          createdAt: new Date('2025-01-20T10:00:00Z'),
          user: {
            id: 'user_2',
            name: 'Member',
            emailOrUsername: 'member@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
      ] as any);

      let members = await getFamilyMembers(familySpaceId);
      expect(members).toHaveLength(2);

      // 2. Remove a member
      mockFindFirst.mockResolvedValue({
        id: 'membership_2',
        role: 'member',
      } as any);
      mockDelete.mockResolvedValue({} as any);

      const removeResult = await removeFamilyMember(familySpaceId, 'user_2');
      expect(removeResult.removed).toBe(true);

      // 3. Get members again (now has 1)
      mockFindMany.mockResolvedValue([
        {
          id: 'membership_1',
          userId: 'user_1',
          familySpaceId,
          role: 'owner',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          user: {
            id: 'user_1',
            name: 'Owner',
            emailOrUsername: 'owner@example.com',
            avatarUrl: null,
            posts: [],
          },
        },
      ] as any);

      members = await getFamilyMembers(familySpaceId);
      expect(members).toHaveLength(1);
      expect(members[0].role).toBe('owner');
    });

    it('handles attempt to remove non-existent member gracefully', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await removeFamilyMember('family_123', 'nonexistent_user');

      expect(result.removed).toBe(false);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
