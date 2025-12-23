import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { DELETE } from '@/app/api/comments/[commentId]/route';

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
  applyRateLimit: jest.fn(() => null),
}));

import { getCurrentUser } from '@/lib/session';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('DELETE /api/comments/[commentId]', () => {
  const mockMemberUser = {
    id: 'user_123',
    email: 'member@example.com',
    username: 'member',
    emailOrUsername: 'member@example.com',
    name: 'Member User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  const mockOwnerUser = {
    id: 'owner_123',
    email: 'owner@example.com',
    username: 'owner',
    emailOrUsername: 'owner@example.com',
    name: 'Owner User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'owner' as const,
    avatarUrl: null,
  };

  const mockAdminUser = {
    id: 'admin_123',
    email: 'admin@example.com',
    username: 'admin',
    emailOrUsername: 'admin@example.com',
    name: 'Admin User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'admin' as const,
    avatarUrl: null,
  };

  const mockContext = {
    params: { commentId: 'clh0000000000000000000101' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockMemberUser);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid comment ID', async () => {
      const invalidContext = { params: { commentId: '' } };

      const request = new NextRequest('http://localhost/api/comments/', {
        method: 'DELETE',
      });

      const response = await DELETE(request, invalidContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Comment Existence', () => {
    it('returns 404 for non-existent comment', async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000999',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, {
        params: { commentId: 'clh0000000000000000000999' },
      });

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(prismaMock.comment.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for comment in different family', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_other',
        post: {
          familySpaceId: 'family_other',
        },
      } as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(404);
      expect(prismaMock.comment.delete).not.toHaveBeenCalled();
    });
  });

  describe('Permissions', () => {
    it('allows author to delete their own comment', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_123',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(204);
      expect(prismaMock.comment.delete).toHaveBeenCalledWith({
        where: { id: 'clh0000000000000000000101' },
      });
    });

    it('allows owner to delete any comment', async () => {
      mockGetCurrentUser.mockResolvedValue(mockOwnerUser);
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_other',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(204);
      expect(prismaMock.comment.delete).toHaveBeenCalledWith({
        where: { id: 'clh0000000000000000000101' },
      });
    });

    it('allows admin to delete any comment', async () => {
      mockGetCurrentUser.mockResolvedValue(mockAdminUser);
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_other',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(204);
      expect(prismaMock.comment.delete).toHaveBeenCalledWith({
        where: { id: 'clh0000000000000000000101' },
      });
    });

    it('prevents non-author member from deleting comment', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_other',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(403);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(prismaMock.comment.delete).not.toHaveBeenCalled();
    });
  });

  describe('Success Cases', () => {
    it('returns 204 on successful deletion', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_123',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(204);
      const body = await parseResponseJSON(response);
      expect(body).toBeNull();
    });

    it('deletes comment from database', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000456',
        authorId: 'user_123',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockResolvedValue({} as any);

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000456',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, {
        params: { commentId: 'clh0000000000000000000456' },
      });

      expect(response.status).toBe(204);
      expect(prismaMock.comment.delete).toHaveBeenCalledWith({
        where: { id: 'clh0000000000000000000456' },
      });
      expect(prismaMock.comment.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during comment lookup', async () => {
      prismaMock.comment.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during comment deletion', async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 'clh0000000000000000000101',
        authorId: 'user_123',
        post: {
          familySpaceId: 'family_123',
        },
      } as any);
      prismaMock.comment.delete.mockRejectedValue(new Error('Delete error'));

      const request = new NextRequest(
        'http://localhost/api/comments/clh0000000000000000000101',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
