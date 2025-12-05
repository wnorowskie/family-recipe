import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/family/members/[userId]/route';
import * as family from '@/lib/family';
import { prisma } from '@/lib/prisma';

// Mock the family helper
jest.mock('@/lib/family', () => ({
  removeFamilyMember: jest.fn(),
}));

// Mock getCurrentUser
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    familyMembership: {
      findFirst: jest.fn(),
    },
  },
}));

const mockRemoveFamilyMember = family.removeFamilyMember as jest.MockedFunction<
  typeof family.removeFamilyMember
>;

const mockPrismaFindFirst = prisma.familyMembership.findFirst as jest.MockedFunction<
  typeof prisma.familyMembership.findFirst
>;

const { getCurrentUser } = require('@/lib/session');

describe('DELETE /api/family/members/[userId]', () => {
  const mockOwner = {
    id: 'clq1234567890abcdef',
    emailOrUsername: 'owner@example.com',
    name: 'Owner User',
    avatarUrl: null,
    familySpaceId: 'family_test123',
    role: 'owner' as const,
  };

  const mockAdmin = {
    id: 'clq2345678901bcdefg',
    emailOrUsername: 'admin@example.com',
    name: 'Admin User',
    avatarUrl: null,
    familySpaceId: 'family_test123',
    role: 'admin' as const,
  };

  const mockMember = {
    id: 'clq3456789012cdefgh',
    emailOrUsername: 'member@example.com',
    name: 'Member User',
    avatarUrl: null,
    familySpaceId: 'family_test123',
    role: 'member' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(mockOwner);
  });

  async function parseResponseJSON(response: Response) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  describe('Authentication', () => {
    it('requires authentication', async () => {
      getCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/family/members/user_target', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'user_target' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid user ID format', async () => {
      const request = new NextRequest('http://localhost/api/family/members/invalid-id', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'invalid-id' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Member Existence', () => {
    it('returns 404 for non-existent user', async () => {
      mockPrismaFindFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toBe('Member not found');
    });

    it('returns 404 when removeFamilyMember returns removed: false', async () => {
      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_user',
        familySpaceId: 'family_test123',
        role: 'member',
        createdAt: new Date(),
        user: { id: 'target_user' },
      } as any);

      mockRemoveFamilyMember.mockResolvedValue({ removed: false });

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Permissions', () => {
    it('allows owner to remove member', async () => {
      getCurrentUser.mockResolvedValue(mockOwner);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_member',
        familySpaceId: 'family_test123',
        role: 'member',
        createdAt: new Date(),
        user: { id: 'target_member' },
      } as any);

      mockRemoveFamilyMember.mockResolvedValue({ removed: true });

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.status).toBe('removed');
    });

    it('allows owner to remove admin', async () => {
      getCurrentUser.mockResolvedValue(mockOwner);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_admin',
        familySpaceId: 'family_test123',
        role: 'admin',
        createdAt: new Date(),
        user: { id: 'target_admin' },
      } as any);

      mockRemoveFamilyMember.mockResolvedValue({ removed: true });

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.status).toBe('removed');
    });

    it('allows admin to remove member', async () => {
      getCurrentUser.mockResolvedValue(mockAdmin);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_member',
        familySpaceId: 'family_test123',
        role: 'member',
        createdAt: new Date(),
        user: { id: 'target_member' },
      } as any);

      mockRemoveFamilyMember.mockResolvedValue({ removed: true });

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.status).toBe('removed');
    });

    it('prevents member from removing other members', async () => {
      getCurrentUser.mockResolvedValue(mockMember);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_member',
        familySpaceId: 'family_test123',
        role: 'member',
        createdAt: new Date(),
        user: { id: 'target_member' },
      } as any);

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Insufficient permissions');
    });

    it('prevents user from removing themselves', async () => {
      getCurrentUser.mockResolvedValue(mockOwner);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: mockOwner.id,
        familySpaceId: 'family_test123',
        role: 'owner',
        createdAt: new Date(),
        user: { id: mockOwner.id },
      } as any);

      const request = new NextRequest(`http://localhost/api/family/members/${mockOwner.id}`, {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: mockOwner.id } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('You cannot remove yourself');
    });

    it('prevents removing the owner', async () => {
      getCurrentUser.mockResolvedValue(mockAdmin);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'owner_user',
        familySpaceId: 'family_test123',
        role: 'owner',
        createdAt: new Date(),
        user: { id: 'owner_user' },
      } as any);

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Cannot remove the owner');
    });

    it('handles CANNOT_REMOVE_OWNER error from removeFamilyMember', async () => {
      getCurrentUser.mockResolvedValue(mockOwner);

      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'other_owner',
        familySpaceId: 'family_test123',
        role: 'owner',
        createdAt: new Date(),
        user: { id: 'other_owner' },
      } as any);

      const error = new Error('CANNOT_REMOVE_OWNER');
      mockRemoveFamilyMember.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Cannot remove the owner');
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during membership lookup', async () => {
      mockPrismaFindFirst.mockRejectedValue(new Error('Database connection error'));

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Unable to remove member');
    });

    it('handles errors from removeFamilyMember helper', async () => {
      mockPrismaFindFirst.mockResolvedValue({
        id: 'membership_1',
        userId: 'target_member',
        familySpaceId: 'family_test123',
        role: 'member',
        createdAt: new Date(),
        user: { id: 'target_member' },
      } as any);

      mockRemoveFamilyMember.mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest('http://localhost/api/family/members/clq1234567890', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { userId: 'clq1234567890' } });
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Unable to remove member');
    });
  });
});
