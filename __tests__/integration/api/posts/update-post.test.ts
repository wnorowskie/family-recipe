/**
 * Integration Tests: PUT /api/posts/[postId]
 *
 * Tests the complete post update flow including:
 * - Authentication requirements
 * - Permission checks (author, owner, admin)
 * - Validation of updated post data
 * - Change note requirements for recipe edits
 * - Photo management (add, remove, reorder)
 * - Recipe details updates
 * - Tag updates
 * - Tracking of lastEditedAt, lastEditedBy, lastEditNote
 * - Error handling
 */

// Mock all dependencies BEFORE imports
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: require('../../helpers/mock-prisma').prismaMock,
}));
jest.mock('@/lib/session');
jest.mock('@/lib/logger');
jest.mock('@/lib/rateLimit', () => ({
  postCreationLimiter: {
    getUserKey: jest.fn(() => 'user-key'),
  },
  applyRateLimit: jest.fn(() => null),
}));
jest.mock('@/lib/uploads', () => ({
  savePhotoFile: jest.fn(async (file: File) => ({
    url: `/uploads/${file.name}`,
    filePath: `/public/uploads/${file.name}`,
  })),
}));
jest.mock('@/lib/posts', () => ({
  getPostDetail: jest.fn(),
}));
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Now import after mocks are set up
import { PUT } from '@/app/api/posts/[postId]/route';
import { prismaMock, resetPrismaMock } from '../../helpers/mock-prisma';
import {
  createMockUser,
  createMockPost,
  createMockTag,
} from '../../helpers/test-data';
import { parseResponseJSON } from '../../helpers/request-helpers';
import { getCurrentUser } from '@/lib/session';
import { savePhotoFile } from '@/lib/uploads';
import { getPostDetail } from '@/lib/posts';
import { revalidatePath } from 'next/cache';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockSavePhotoFile = savePhotoFile as jest.MockedFunction<
  typeof savePhotoFile
>;
const mockGetPostDetail = getPostDetail as jest.MockedFunction<
  typeof getPostDetail
>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>;

describe('PUT /api/posts/[postId]', () => {
  // Mock authenticated users
  const mockAuthor = {
    id: 'user_author',
    name: 'Post Author',
    email: 'author@example.com',
    username: 'author',
    emailOrUsername: 'author@example.com',
    avatarUrl: null,
    role: 'member',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
  };

  const mockOwner = {
    id: 'user_owner',
    name: 'Family Owner',
    email: 'owner@example.com',
    username: 'owner',
    emailOrUsername: 'owner@example.com',
    avatarUrl: null,
    role: 'owner',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
  };

  const mockOtherMember = {
    id: 'user_other',
    name: 'Other Member',
    email: 'other@example.com',
    username: 'other',
    emailOrUsername: 'other@example.com',
    avatarUrl: null,
    role: 'member',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
  };

  const mockContext = {
    params: { postId: 'post_123' },
  };

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();

    // Default: author is authenticated
    mockGetCurrentUser.mockResolvedValue(mockAuthor);
  });

  // Helper to create FormData request
  const createFormDataRequest = (payload: any, photos?: File[]) => {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    if (photos) {
      photos.forEach((photo) => {
        formData.append('photos', photo);
      });
    }

    return new Request('http://localhost:3000/api/posts/post_123', {
      method: 'PUT',
      body: formData,
    }) as any;
  };

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(401);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Post Existence', () => {
    it('returns 404 for non-existent post', async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(404);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toContain('Post not found');
    });

    it('returns 404 for post in different family', async () => {
      const postInDifferentFamily = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: 'family_different',
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(null); // Won't find it due to familySpaceId filter

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(404);
    });
  });

  describe('Permissions', () => {
    it('allows author to edit their own post', async () => {
      // Author is authenticated (already set in beforeEach)
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          title: 'Original Title',
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });

      const updatedPostDetail = { ...existingPost, title: 'Updated Title' };
      mockGetPostDetail.mockResolvedValue(updatedPostDetail as any);

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);
    });

    it('allows owner to edit any post', async () => {
      // Set owner as authenticated user
      mockGetCurrentUser.mockResolvedValue(mockOwner);

      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id, // Different from owner
          familySpaceId: mockOwner.familySpaceId,
          title: 'Original Title',
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });

      const updatedPostDetail = { ...existingPost, title: 'Updated by Owner' };
      mockGetPostDetail.mockResolvedValue(updatedPostDetail as any);

      const request = createFormDataRequest({
        title: 'Updated by Owner',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);
    });

    it('prevents non-author member from editing post', async () => {
      // Set other member as authenticated user
      mockGetCurrentUser.mockResolvedValue(mockOtherMember);

      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockOtherMember.familySpaceId,
          title: 'Original Title',
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      const request = createFormDataRequest({
        title: 'Trying to Update',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(403);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('permission');
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
    });

    it('requires payload in form data', async () => {
      const formData = new FormData();
      // No payload appended

      const request = new Request('http://localhost:3000/api/posts/post_123', {
        method: 'PUT',
        body: formData,
      }) as any;

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_PAYLOAD');
    });

    it('requires payload to be valid JSON', async () => {
      const formData = new FormData();
      formData.append('payload', 'not-valid-json{');

      const request = new Request('http://localhost:3000/api/posts/post_123', {
        method: 'PUT',
        body: formData,
      }) as any;

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_JSON');
    });

    it('requires title', async () => {
      const request = createFormDataRequest({
        caption: 'Updated caption',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates change note length (max 280 chars)', async () => {
      const request = createFormDataRequest({
        title: 'Updated Title',
        changeNote: 'a'.repeat(281),
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_CHANGE_NOTE');
    });

    it('rejects more than 10 photos', async () => {
      const photos = Array.from(
        { length: 11 },
        (_, i) => new File(['photo'], `photo${i}.jpg`, { type: 'image/jpeg' })
      );

      const request = createFormDataRequest(
        {
          title: 'Updated Post',
        },
        photos
      );

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('TOO_MANY_PHOTOS');
    });
  });

  describe('Basic Post Updates', () => {
    it('updates post title and caption', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          title: 'Original Title',
          caption: 'Original caption',
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      // Mock transaction
      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue({
        ...existingPost,
        title: 'Updated Title',
      });
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });

      const updatedPostDetail = {
        ...existingPost,
        title: 'Updated Title',
        caption: 'Updated caption',
      };
      mockGetPostDetail.mockResolvedValue(updatedPostDetail as any);

      const request = createFormDataRequest({
        title: 'Updated Title',
        caption: 'Updated caption',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);

      const data = await parseResponseJSON(response);
      expect(data.post.title).toBe('Updated Title');

      expect(prismaMock.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post_123' },
          data: expect.objectContaining({
            title: 'Updated Title',
            caption: 'Updated caption',
          }),
        })
      );
    });

    it('updates lastEditedBy and lastEditAt', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue(existingPost as any);

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      await PUT(request, mockContext);

      expect(prismaMock.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastEditedBy: mockAuthor.id,
            lastEditAt: expect.any(Date),
          }),
        })
      );
    });

    it('stores changeNote in lastEditNote', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue(existingPost as any);

      const request = createFormDataRequest({
        title: 'Updated Title',
        changeNote: 'Fixed typos',
      });

      await PUT(request, mockContext);

      expect(prismaMock.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastEditNote: 'Fixed typos',
          }),
        })
      );
    });

    it('revalidates relevant paths after update', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue(existingPost as any);

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      await PUT(request, mockContext);

      expect(mockRevalidatePath).toHaveBeenCalledWith('/timeline');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/recipes');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/posts/post_123');
    });
  });

  describe('Recipe Updates', () => {
    it('updates existing recipe details', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          hasRecipeDetails: true,
        }),
        photos: [],
        recipeDetails: {
          id: 'recipe_123',
          postId: 'post_123',
          origin: 'Grandma',
          ingredients: JSON.stringify([
            { name: 'Flour', quantity: 2, unit: 'cup' },
          ]),
          steps: JSON.stringify([{ text: 'Mix' }]),
          totalTime: 30,
          servings: 4,
          course: 'dinner' as const,
          courses: JSON.stringify(['dinner']),
          difficulty: 'easy' as const,
        },
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.recipeDetails.update.mockResolvedValue(
        existingPost.recipeDetails
      );
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue(existingPost as any);

      const request = createFormDataRequest({
        title: 'Updated Recipe',
        recipe: {
          origin: 'Mom',
          ingredients: [{ name: 'Sugar', quantity: 1, unit: 'cup' }],
          steps: [{ text: 'Stir well' }],
          totalTime: 45,
          servings: 6,
          difficulty: 'medium',
        },
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);

      expect(prismaMock.recipeDetails.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { postId: 'post_123' },
          data: expect.objectContaining({
            origin: 'Mom',
            totalTime: 45,
            servings: 6,
            difficulty: 'medium',
          }),
        })
      );
    });

    it('creates recipe details when adding recipe to basic post', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          hasRecipeDetails: false,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue({
        ...existingPost,
        hasRecipeDetails: true,
      });
      prismaMock.recipeDetails.create.mockResolvedValue({} as any);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue({
        ...existingPost,
        hasRecipeDetails: true,
      } as any);

      const request = createFormDataRequest({
        title: 'Now a Recipe',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Mix ingredients' }],
        },
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);

      expect(prismaMock.recipeDetails.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            postId: 'post_123',
          }),
        })
      );
    });

    it('deletes recipe details when removing recipe', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          hasRecipeDetails: true,
        }),
        photos: [],
        recipeDetails: {
          id: 'recipe_123',
          postId: 'post_123',
          origin: 'Test',
          ingredients: '[]',
          steps: '[]',
          totalTime: null,
          servings: null,
          course: null,
          courses: null,
          difficulty: null,
        },
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue({
        ...existingPost,
        hasRecipeDetails: false,
      });
      prismaMock.recipeDetails.delete.mockResolvedValue({} as any);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      mockGetPostDetail.mockResolvedValue({
        ...existingPost,
        hasRecipeDetails: false,
      } as any);

      const request = createFormDataRequest({
        title: 'Just a Basic Post Now',
        caption: 'No recipe anymore',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);

      expect(prismaMock.recipeDetails.delete).toHaveBeenCalledWith({
        where: { postId: 'post_123' },
      });
    });
  });

  describe('Tag Updates', () => {
    it('updates tags on post', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
          hasRecipeDetails: true,
        }),
        photos: [],
        recipeDetails: {} as any,
      } as any;

      const mockTags = [
        {
          ...createMockTag({ id: 'tag_1', name: 'vegetarian' }),
          type: null,
        } as any,
        { ...createMockTag({ id: 'tag_2', name: 'quick' }), type: null } as any,
      ];

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
      prismaMock.tag.findMany.mockResolvedValue(mockTags);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prismaMock);
      });

      prismaMock.post.update.mockResolvedValue(existingPost);
      prismaMock.postTag.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.postTag.createMany.mockResolvedValue({ count: 2 });
      mockGetPostDetail.mockResolvedValue(existingPost as any);

      const request = createFormDataRequest({
        title: 'Tagged Recipe',
        recipe: {
          ingredients: [{ name: 'Veggies', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Cook' }],
          tags: ['vegetarian', 'quick'],
        },
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(200);

      expect(prismaMock.postTag.deleteMany).toHaveBeenCalledWith({
        where: { postId: 'post_123' },
      });

      expect(prismaMock.postTag.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ postId: 'post_123', tagId: 'tag_1' }),
          expect.objectContaining({ postId: 'post_123', tagId: 'tag_2' }),
        ]),
      });
    });

    it('rejects invalid tags', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      // Only return 1 tag when 2 were requested
      prismaMock.tag.findMany.mockResolvedValue([
        {
          ...createMockTag({ id: 'tag_1', name: 'vegetarian' }),
          type: null,
        } as any,
      ]);

      const request = createFormDataRequest({
        title: 'Updated Recipe',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          tags: ['vegetarian', 'nonexistent-tag'],
        },
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_TAG');
    });
  });

  describe('Error Handling', () => {
    it('handles unsupported file type', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
      mockSavePhotoFile.mockRejectedValue(new Error('UNSUPPORTED_FILE_TYPE'));

      const photos = [new File(['photo'], 'photo.txt', { type: 'text/plain' })];

      const request = createFormDataRequest(
        {
          title: 'Updated Post',
        },
        photos
      );

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('handles file too large', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);
      mockSavePhotoFile.mockRejectedValue(new Error('FILE_TOO_LARGE'));

      const photos = [
        new File(['x'.repeat(9 * 1024 * 1024)], 'large.jpg', {
          type: 'image/jpeg',
        }),
      ];

      const request = createFormDataRequest(
        {
          title: 'Updated Post',
        },
        photos
      );

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
    });

    it('handles database errors', async () => {
      const existingPost = {
        ...createMockPost({
          id: 'post_123',
          authorId: mockAuthor.id,
          familySpaceId: mockAuthor.familySpaceId,
        }),
        photos: [],
        recipeDetails: null,
      } as any;

      prismaMock.post.findFirst.mockResolvedValue(existingPost);

      prismaMock.$transaction.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createFormDataRequest({
        title: 'Updated Title',
      });

      const response = await PUT(request, mockContext);
      expect(response.status).toBe(500);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
