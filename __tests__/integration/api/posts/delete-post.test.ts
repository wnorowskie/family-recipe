/**
 * Integration Tests: DELETE /api/posts/[postId]
 *
 * Tests the delete post endpoint with authentication, permissions,
 * post existence, and file cleanup.
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

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/uploads', () => ({
  deleteUploadedFiles: jest.fn(),
}));

// Import after mocks
import { DELETE } from '@/app/api/posts/[postId]/route';
import { prismaMock } from '../../helpers/mock-prisma';
import { getCurrentUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { deleteUploadedFiles } from '@/lib/uploads';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>;
const mockDeleteUploadedFiles = deleteUploadedFiles as jest.MockedFunction<
  typeof deleteUploadedFiles
>;

// Helper to parse JSON response
async function parseResponseJSON(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe('DELETE /api/posts/[postId]', () => {
  const mockAuthor = {
    id: 'user_author',
    name: 'Author User',
    email: 'author@example.com',
    username: 'author',
    emailOrUsername: 'author@example.com',
    avatarUrl: null,
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member',
  };

  const mockOwner = {
    id: 'user_owner',
    name: 'Owner User',
    email: 'owner@example.com',
    username: 'owner',
    emailOrUsername: 'owner@example.com',
    avatarUrl: null,
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'owner',
  };

  const mockOtherMember = {
    id: 'user_other',
    name: 'Other Member',
    email: 'other@example.com',
    username: 'other',
    emailOrUsername: 'other@example.com',
    avatarUrl: null,
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member',
  };

  const mockContext = {
    params: { postId: 'post_123' },
  };

  const mockRequest = new Request('http://localhost/api/posts/post_123', {
    method: 'DELETE',
  }) as any; // NextRequest compatible

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockAuthor);
    mockDeleteUploadedFiles.mockResolvedValue(undefined);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid post ID', async () => {
      const invalidContext = {
        params: { postId: '' }, // Empty post ID
      };

      const response = await DELETE(mockRequest, invalidContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_PARAMS');
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
        select: expect.any(Object),
      });
    });
  });

  describe('Permissions', () => {
    it('allows author to delete their own post', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.status).toBe('deleted');
      expect(prismaMock.post.delete).toHaveBeenCalledWith({
        where: { id: 'post_123' },
      });
    });

    it('allows owner to delete any post', async () => {
      mockGetCurrentUser.mockResolvedValue(mockOwner);

      const mockPost = {
        id: 'post_123',
        authorId: 'user_author', // Different from owner
        photos: [],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.status).toBe('deleted');
    });

    it('prevents non-author member from deleting post', async () => {
      mockGetCurrentUser.mockResolvedValue(mockOtherMember);

      const mockPost = {
        id: 'post_123',
        authorId: 'user_author', // Different author
        photos: [],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(403);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe(
        'You do not have permission to delete this post'
      );
      expect(prismaMock.post.delete).not.toHaveBeenCalled();
    });
  });

  describe('File Cleanup', () => {
    it('deletes post photos from file system', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [
          { storageKey: 'uploads/photo1.jpg' },
          { storageKey: 'uploads/photo2.jpg' },
        ],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockDeleteUploadedFiles).toHaveBeenCalledWith([
        'uploads/photo1.jpg',
        'uploads/photo2.jpg',
      ]);
    });

    it('deletes comment photos from file system', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [],
        comments: [
          { photoStorageKey: 'uploads/comment1.jpg' },
          { photoStorageKey: 'uploads/comment2.jpg' },
          { photoStorageKey: null },
        ],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockDeleteUploadedFiles).toHaveBeenCalledWith([
        'uploads/comment1.jpg',
        'uploads/comment2.jpg',
      ]);
    });

    it('deletes both post and comment photos', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [
          { storageKey: 'uploads/post1.jpg' },
          { storageKey: 'uploads/post2.jpg' },
        ],
        comments: [
          { photoStorageKey: 'uploads/comment1.jpg' },
          { photoStorageKey: null },
        ],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockDeleteUploadedFiles).toHaveBeenCalledWith([
        'uploads/post1.jpg',
        'uploads/post2.jpg',
        'uploads/comment1.jpg',
      ]);
    });
  });

  describe('Cache Revalidation', () => {
    it('revalidates relevant paths after deletion', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockResolvedValue({
        id: 'post_123',
        title: 'Test Post',
        caption: null,
        authorId: 'user_author',
        familySpaceId: 'family_123',
        mainPhotoStorageKey: null,
        hasRecipeDetails: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastEditAt: null,
        lastEditedBy: null,
        lastEditNote: null,
      });

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/timeline');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/recipes');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/profile');
      expect(mockRevalidatePath).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('handles database errors gracefully', async () => {
      prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('An unexpected error occurred');
    });

    it('handles deletion errors gracefully', async () => {
      const mockPost = {
        id: 'post_123',
        authorId: 'user_author',
        photos: [],
        comments: [],
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(mockPost);
      prismaMock.post.delete.mockRejectedValue(new Error('Deletion failed'));

      const response = await DELETE(mockRequest, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
