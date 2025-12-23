import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { GET, POST } from '@/app/api/posts/[postId]/comments/route';

const mockResolveUrl = jest.fn(async (key?: string | null) =>
  key ? `https://signed.example/${key}` : null
);

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
  commentLimiter: {
    getUserKey: jest.fn(() => 'user_123'),
  },
  applyRateLimit: jest.fn(() => null),
}));

jest.mock('@/lib/posts', () => ({
  getPostCommentsPage: jest.fn(),
}));

jest.mock('@/lib/uploads', () => ({
  savePhotoFile: jest.fn(),
  getSignedUploadUrl: jest.fn(),
  createSignedUrlResolver: jest.fn(() => mockResolveUrl),
}));

import { getCurrentUser } from '@/lib/session';
import { getPostCommentsPage } from '@/lib/posts';
import { savePhotoFile, getSignedUploadUrl } from '@/lib/uploads';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockGetPostCommentsPage = getPostCommentsPage as jest.MockedFunction<
  typeof getPostCommentsPage
>;
const mockSavePhotoFile = savePhotoFile as jest.MockedFunction<
  typeof savePhotoFile
>;
const mockGetSignedUploadUrl = getSignedUploadUrl as jest.MockedFunction<
  typeof getSignedUploadUrl
>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('GET /api/posts/[postId]/comments', () => {
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    username: 'testuser',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  const mockContext = {
    params: { postId: 'clh0000000000000000000001' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockGetSignedUploadUrl.mockImplementation(
      async (key: string | null | undefined) =>
        key ? `https://signed.example/${key}` : null
    );
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(async (key?: string | null) =>
      key ? `https://signed.example/${key}` : null
    );
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid post ID', async () => {
      const invalidContext = { params: { postId: '' } };

      const request = new NextRequest('http://localhost/api/posts//comments', {
        method: 'GET',
      });

      const response = await GET(request, invalidContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Post Existence', () => {
    it('returns 404 for non-existent post', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000999/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, {
        params: { postId: 'clh0000000000000000000999' },
      });

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for post in different family', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000002/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, {
        params: { postId: 'clh0000000000000000000002' },
      });

      expect(response.status).toBe(404);
      expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clh0000000000000000000002',
          familySpaceId: 'family_123',
        },
        select: { id: true },
      });
    });
  });

  describe('Success Cases', () => {
    it('returns paginated comments for post', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockGetPostCommentsPage.mockResolvedValue({
        comments: [
          {
            id: 'clh0000000000000000000011',
            text: 'Great recipe!',
            photoUrl: null,
            createdAt: new Date('2024-01-01').toISOString(),
            author: {
              id: 'user_1',
              name: 'User One',
              avatarUrl: null,
            },
            reactions: [],
          },
          {
            id: 'clh0000000000000000000012',
            text: 'Love it!',
            photoUrl: '/uploads/photo.jpg',
            createdAt: new Date('2024-01-02').toISOString(),
            author: {
              id: 'user_2',
              name: 'User Two',
              avatarUrl: null,
            },
            reactions: [],
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.comments).toHaveLength(2);
      expect(data.comments[0].text).toBe('Great recipe!');
      expect(data.hasMore).toBe(false);
    });

    it('returns empty array when post has no comments', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockGetPostCommentsPage.mockResolvedValue({
        comments: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.comments).toEqual([]);
    });

    it('accepts limit and offset parameters', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockGetPostCommentsPage.mockResolvedValue({
        comments: [],
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments?limit=10&offset=10',
        { method: 'GET' }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(200);
      expect(mockGetPostCommentsPage).toHaveBeenCalledWith({
        postId: 'clh0000000000000000000001',
        familySpaceId: 'family_123',
        limit: 10,
        offset: 10,
      });
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during post lookup', async () => {
      prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during comment fetch', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockGetPostCommentsPage.mockRejectedValue(new Error('Fetch error'));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'GET',
        }
      );

      const response = await GET(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});

describe('POST /api/posts/[postId]/comments', () => {
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    username: 'testuser',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  const mockContext = {
    params: { postId: 'clh0000000000000000000001' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('returns 400 for invalid post ID', async () => {
      const invalidContext = { params: { postId: '' } };

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest('http://localhost/api/posts//comments', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request, invalidContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires payload in form data', async () => {
      const formData = new FormData();

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('payload');
    });

    it('requires text content', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({}));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty text content', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: '' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Post Existence', () => {
    it('returns 404 for non-existent post', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000999/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, {
        params: { postId: 'clh0000000000000000000999' },
      });

      expect(response.status).toBe(404);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    });

    it('returns 404 for post in different family', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000002/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, {
        params: { postId: 'clh0000000000000000000002' },
      });

      expect(response.status).toBe(404);
      expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'clh0000000000000000000002',
          familySpaceId: 'family_123',
        },
        select: { id: true },
      });
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    });
  });

  describe('Success Cases', () => {
    it('creates comment successfully', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      prismaMock.comment.create.mockResolvedValue({
        id: 'clh0000000000000000000101',
        postId: 'clh0000000000000000000001',
        authorId: 'user_123',
        text: 'Great recipe!',
        photoStorageKey: null,
        createdAt: new Date('2024-01-01'),
        author: {
          id: 'user_123',
          name: 'Test User',
          avatarStorageKey: null,
        },
      } as any);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great recipe!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      const data = await parseResponseJSON(response);
      expect(data.comment.id).toBe('clh0000000000000000000101');
      expect(data.comment.text).toBe('Great recipe!');
      expect(data.comment.photoUrl).toBeNull();
      expect(prismaMock.comment.create).toHaveBeenCalledWith({
        data: {
          postId: 'clh0000000000000000000001',
          authorId: 'user_123',
          text: 'Great recipe!',
          photoStorageKey: null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarStorageKey: true,
            },
          },
        },
      });
    });

    it('accepts optional photo', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockSavePhotoFile.mockResolvedValue({
        storageKey: 'uploads/comment-photo.jpg',
        url: '/uploads/comment-photo.jpg',
        filePath: '/public/uploads/comment-photo.jpg',
      });
      prismaMock.comment.create.mockResolvedValue({
        id: 'clh0000000000000000000101',
        postId: 'clh0000000000000000000001',
        authorId: 'user_123',
        text: 'Look at this!',
        photoStorageKey: 'uploads/comment-photo.jpg',
        createdAt: new Date('2024-01-01'),
        author: {
          id: 'user_123',
          name: 'Test User',
          avatarStorageKey: null,
        },
      } as any);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Look at this!' }));

      // Create a mock File
      const mockFile = new File(['photo content'], 'photo.jpg', {
        type: 'image/jpeg',
      });
      formData.append('photo', mockFile);

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      const data = await parseResponseJSON(response);
      expect(data.comment.photoUrl).toBe(
        'https://signed.example/uploads/comment-photo.jpg'
      );
      expect(mockSavePhotoFile).toHaveBeenCalledTimes(1);
      expect(prismaMock.comment.create).toHaveBeenCalledWith({
        data: {
          postId: 'clh0000000000000000000001',
          authorId: 'user_123',
          text: 'Look at this!',
          photoStorageKey: 'uploads/comment-photo.jpg',
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarStorageKey: true,
            },
          },
        },
      });
    });

    it('returns comment with author information', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      prismaMock.comment.create.mockResolvedValue({
        id: 'clh0000000000000000000101',
        postId: 'clh0000000000000000000001',
        authorId: 'user_456',
        text: 'Nice!',
        photoUrl: null,
        createdAt: new Date('2024-01-01'),
        author: {
          id: 'user_456',
          name: 'Another User',
          avatarUrl: null,
          avatarStorageKey: 'avatar.jpg',
        },
      } as any);

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Nice!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      const data = await parseResponseJSON(response);
      expect(data.comment.author).toEqual({
        id: 'user_456',
        name: 'Another User',
        avatarUrl: 'https://signed.example/avatar.jpg',
      });
      expect(data.comment.reactions).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during post lookup', async () => {
      prismaMock.post.findFirst.mockRejectedValue(new Error('Database error'));

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during comment creation', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      prismaMock.comment.create.mockRejectedValue(new Error('Create error'));

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles errors during photo upload', async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 'clh0000000000000000000001',
      } as any);
      mockSavePhotoFile.mockRejectedValue(new Error('Upload error'));

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: 'Great!' }));
      const mockFile = new File(['photo content'], 'photo.jpg', {
        type: 'image/jpeg',
      });
      formData.append('photo', mockFile);

      const request = new NextRequest(
        'http://localhost/api/posts/clh0000000000000000000001/comments',
        {
          method: 'POST',
          body: formData,
        }
      );

      const response = await POST(request, mockContext);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
