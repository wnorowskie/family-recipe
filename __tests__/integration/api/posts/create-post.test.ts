/**
 * Integration Tests: POST /api/posts
 *
 * Tests the complete post creation flow including:
 * - Authentication requirements
 * - Validation of post data
 * - Basic post creation (without recipe)
 * - Full recipe post creation
 * - Photo upload handling
 * - Tag validation and association
 * - Course and difficulty enums
 * - Ingredient and step parsing
 * - Error handling (file types, size limits, invalid tags)
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
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Now import after mocks are set up
import { POST } from '@/app/api/posts/route';
import { prismaMock, resetPrismaMock } from '../../helpers/mock-prisma';
import {
  createMockUser,
  createMockPost,
  createMockTag,
  createMockFamilySpace,
} from '../../helpers/test-data';
import { parseResponseJSON } from '../../helpers/request-helpers';
import { getCurrentUser } from '@/lib/session';
import { savePhotoFile } from '@/lib/uploads';
import { revalidatePath } from 'next/cache';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockSavePhotoFile = savePhotoFile as jest.MockedFunction<
  typeof savePhotoFile
>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<
  typeof revalidatePath
>;

describe('POST /api/posts', () => {
  // Mock authenticated user (shape returned by getCurrentUser)
  const mockUser = {
    id: 'user_123',
    name: 'Test User',
    emailOrUsername: 'test@example.com',
    avatarUrl: null,
    role: 'member',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
  };

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();

    // Default: user is authenticated
    mockGetCurrentUser.mockResolvedValue(mockUser);
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

    return new Request('http://localhost:3000/api/posts', {
      method: 'POST',
      body: formData,
    }) as any;
  };

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = createFormDataRequest({
        title: 'Test Post',
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(401);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('requires payload in form data', async () => {
      const formData = new FormData();
      // No payload appended

      const request = new Request('http://localhost:3000/api/posts', {
        method: 'POST',
        body: formData,
      }) as any;

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('Missing payload');
    });

    it('requires payload to be valid JSON', async () => {
      const formData = new FormData();
      formData.append('payload', 'not-valid-json{');

      const request = new Request('http://localhost:3000/api/posts', {
        method: 'POST',
        body: formData,
      }) as any;

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('valid JSON');
    });

    it('requires title', async () => {
      const request = createFormDataRequest({
        caption: 'Post without title',
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects title longer than 200 characters', async () => {
      const request = createFormDataRequest({
        title: 'a'.repeat(201),
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects more than 10 photos', async () => {
      const photos = Array.from(
        { length: 11 },
        (_, i) => new File(['photo'], `photo${i}.jpg`, { type: 'image/jpeg' })
      );

      const request = createFormDataRequest(
        {
          title: 'Post with too many photos',
        },
        photos
      );

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('up to 10 photos');
    });

    it('filters out invalid course values during normalization', async () => {
      // Invalid courses are filtered out during normalization, not rejected
      const mockPost = {
        ...createMockPost({
          id: 'post_123',
          title: 'Recipe with invalid course',
          hasRecipeDetails: true,
        }),
      } as any;

      prismaMock.post.create.mockResolvedValue(mockPost);

      const request = createFormDataRequest({
        title: 'Recipe with invalid course',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Mix ingredients' }],
          course: 'invalid-course',
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201); // Succeeds, but invalid course is filtered out

      const createCall = prismaMock.post.create.mock.calls[0][0];
      const recipeDetails = (createCall.data.recipeDetails as any)?.create;

      // Invalid course should be filtered out (null or undefined)
      expect(recipeDetails?.course).toBeNull();
    });

    it('validates difficulty enum', async () => {
      const request = createFormDataRequest({
        title: 'Recipe with invalid difficulty',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Mix ingredients' }],
          difficulty: 'impossible',
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Basic Post Creation', () => {
    it('creates basic post without recipe', async () => {
      const mockPost = {
        ...createMockPost({
          id: 'post_123',
          title: 'Simple Post',
          caption: 'Just a caption',
          authorId: mockUser.id,
          familySpaceId: mockUser.familySpaceId,
          hasRecipeDetails: false,
        }),
        photos: [],
        tags: [],
      };

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Simple Post',
        caption: 'Just a caption',
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      const data = await parseResponseJSON(response);
      expect(data.post.id).toBe('post_123');
      expect(data.post.title).toBe('Simple Post');
      expect(data.post.caption).toBe('Just a caption');

      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familySpaceId: mockUser.familySpaceId,
            authorId: mockUser.id,
            title: 'Simple Post',
            caption: 'Just a caption',
            hasRecipeDetails: false,
          }),
        })
      );
    });

    it('creates post with photos', async () => {
      const photos = [
        new File(['photo1'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['photo2'], 'photo2.jpg', { type: 'image/jpeg' }),
      ];

      mockSavePhotoFile
        .mockResolvedValueOnce({
          url: '/uploads/photo1.jpg',
          filePath: '/public/uploads/photo1.jpg',
        })
        .mockResolvedValueOnce({
          url: '/uploads/photo2.jpg',
          filePath: '/public/uploads/photo2.jpg',
        });

      const mockPost = {
        ...createMockPost({
          id: 'post_123',
          title: 'Post with Photos',
          mainPhotoUrl: '/uploads/photo1.jpg',
        }),
        photos: [
          {
            id: 'photo_1',
            postId: 'post_123',
            url: '/uploads/photo1.jpg',
            sortOrder: 0,
          },
          {
            id: 'photo_2',
            postId: 'post_123',
            url: '/uploads/photo2.jpg',
            sortOrder: 1,
          },
        ],
      } as any;

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest(
        {
          title: 'Post with Photos',
        },
        photos
      );

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      expect(mockSavePhotoFile).toHaveBeenCalledTimes(2);
      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mainPhotoUrl: '/uploads/photo1.jpg',
            photos: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({
                  url: '/uploads/photo1.jpg',
                  sortOrder: 0,
                }),
                expect.objectContaining({
                  url: '/uploads/photo2.jpg',
                  sortOrder: 1,
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('revalidates timeline after post creation', async () => {
      const mockPost = createMockPost({
        id: 'post_123',
        title: 'New Post',
      });

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'New Post',
      });

      await POST(request, mockUser);

      expect(mockRevalidatePath).toHaveBeenCalledWith('/timeline');
    });
  });

  describe('Recipe Post Creation', () => {
    it('creates post with full recipe details', async () => {
      const mockPost = {
        ...createMockPost({
          id: 'post_123',
          title: 'Chocolate Chip Cookies',
          hasRecipeDetails: true,
        }),
        recipeDetails: {
          id: 'recipe_123',
          postId: 'post_123',
          origin: 'Grandma',
          ingredients: JSON.stringify([
            { name: 'Flour', quantity: 2, unit: 'cup' },
            { name: 'Sugar', quantity: 1, unit: 'cup' },
            { name: 'Chocolate chips', quantity: 1.5, unit: 'cup' },
          ]),
          steps: JSON.stringify([
            { text: 'Mix dry ingredients' },
            { text: 'Add wet ingredients' },
            { text: 'Fold in chocolate chips' },
            { text: 'Bake at 350°F for 12 minutes' },
          ]),
          totalTime: 30,
          servings: 24,
          course: 'dessert' as const,
          courses: JSON.stringify(['dessert']),
          difficulty: 'easy' as const,
        },
      } as any;

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Chocolate Chip Cookies',
        recipe: {
          origin: 'Grandma',
          ingredients: [
            { name: 'Flour', quantity: 2, unit: 'cup' },
            { name: 'Sugar', quantity: 1, unit: 'cup' },
            { name: 'Chocolate chips', quantity: 1.5, unit: 'cup' },
          ],
          steps: [
            { text: 'Mix dry ingredients' },
            { text: 'Add wet ingredients' },
            { text: 'Fold in chocolate chips' },
            { text: 'Bake at 350°F for 12 minutes' },
          ],
          totalTime: 30,
          servings: 24,
          course: 'dessert',
          difficulty: 'easy',
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      const data = await parseResponseJSON(response);
      expect(data.post.hasRecipeDetails).toBe(true);
      expect(data.post.recipeDetails).toBeDefined();

      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hasRecipeDetails: true,
            recipeDetails: expect.objectContaining({
              create: expect.objectContaining({
                origin: 'Grandma',
                ingredients: expect.any(String),
                steps: expect.any(String),
                totalTime: 30,
                servings: 24,
                course: 'dessert',
                courses: expect.any(String),
                difficulty: 'easy',
              }),
            }),
          }),
        })
      );
    });

    it('requires both ingredients and steps for recipe', async () => {
      // Recipe with only ingredients (no steps) should not create recipe details
      const mockPost = createMockPost({
        id: 'post_123',
        title: 'Incomplete Recipe',
        hasRecipeDetails: false,
      });

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Incomplete Recipe',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          // Missing steps
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hasRecipeDetails: false,
            recipeDetails: undefined,
          }),
        })
      );
    });

    it('parses ingredients correctly', async () => {
      const mockPost = createMockPost({
        id: 'post_123',
        hasRecipeDetails: true,
      });

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Recipe',
        recipe: {
          ingredients: [
            { name: 'Flour', quantity: 2.5, unit: 'cup' },
            { name: 'Salt', quantity: 1, unit: 'tsp' },
            { name: 'Eggs', quantity: 3, unit: 'whole' },
          ],
          steps: [{ text: 'Mix all ingredients' }],
        },
      });

      await POST(request, mockUser);

      const createCall = prismaMock.post.create.mock.calls[0][0];
      const ingredientsJson = (createCall.data.recipeDetails as any)?.create
        .ingredients;
      const ingredients = JSON.parse(ingredientsJson);

      expect(ingredients).toEqual([
        { name: 'Flour', quantity: 2.5, unit: 'cup' },
        { name: 'Salt', quantity: 1, unit: 'tsp' },
        { name: 'Eggs', quantity: 3, unit: 'whole' },
      ]);
    });

    it('parses steps correctly', async () => {
      const mockPost = createMockPost({
        id: 'post_123',
        hasRecipeDetails: true,
      });

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Recipe',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [
            { text: 'Step 1: Prepare ingredients' },
            { text: 'Step 2: Mix everything' },
            { text: 'Step 3: Bake' },
          ],
        },
      });

      await POST(request, mockUser);

      const createCall = prismaMock.post.create.mock.calls[0][0];
      const stepsJson = (createCall.data.recipeDetails as any)?.create.steps;
      const steps = JSON.parse(stepsJson);

      expect(steps).toEqual([
        { text: 'Step 1: Prepare ingredients' },
        { text: 'Step 2: Mix everything' },
        { text: 'Step 3: Bake' },
      ]);
    });

    it('handles multiple courses correctly', async () => {
      const mockPost = createMockPost({
        id: 'post_123',
        hasRecipeDetails: true,
      });

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Brunch Recipe',
        recipe: {
          ingredients: [{ name: 'Eggs', quantity: 2, unit: 'whole' }],
          steps: [{ text: 'Cook eggs' }],
          courses: ['breakfast', 'lunch'],
        },
      });

      await POST(request, mockUser);

      const createCall = prismaMock.post.create.mock.calls[0][0];
      const recipeDetails = (createCall.data.recipeDetails as any)?.create;

      expect(recipeDetails?.course).toBe('breakfast'); // First course
      expect(JSON.parse(recipeDetails?.courses || '[]')).toEqual([
        'breakfast',
        'lunch',
      ]);
    });

    it('accepts valid course values', async () => {
      const validCourses = [
        'breakfast',
        'lunch',
        'dinner',
        'dessert',
        'snack',
        'other',
      ];

      for (const course of validCourses) {
        jest.clearAllMocks();
        resetPrismaMock();

        const mockPost = createMockPost({
          id: `post_${course}`,
          hasRecipeDetails: true,
        });

        prismaMock.post.create.mockResolvedValue(mockPost as any);

        const request = createFormDataRequest({
          title: `${course} Recipe`,
          recipe: {
            ingredients: [{ name: 'Test', quantity: 1, unit: 'cup' }],
            steps: [{ text: 'Test step' }],
            course,
          },
        });

        const response = await POST(request, mockUser);
        expect(response.status).toBe(201);
      }
    });

    it('accepts valid difficulty values', async () => {
      const validDifficulties = ['easy', 'medium', 'hard'];

      for (const difficulty of validDifficulties) {
        jest.clearAllMocks();
        resetPrismaMock();

        const mockPost = createMockPost({
          id: `post_${difficulty}`,
          hasRecipeDetails: true,
        });

        prismaMock.post.create.mockResolvedValue(mockPost as any);

        const request = createFormDataRequest({
          title: `${difficulty} Recipe`,
          recipe: {
            ingredients: [{ name: 'Test', quantity: 1, unit: 'cup' }],
            steps: [{ text: 'Test step' }],
            difficulty,
          },
        });

        const response = await POST(request, mockUser);
        expect(response.status).toBe(201);
      }
    });
  });

  describe('Tag Handling', () => {
    it('associates valid tags with post', async () => {
      const mockTags = [
        {
          ...createMockTag({ id: 'tag_1', name: 'vegetarian' }),
          type: 'dietary',
        },
        { ...createMockTag({ id: 'tag_2', name: 'quick' }), type: null },
      ] as any;

      prismaMock.tag.findMany.mockResolvedValue(mockTags);

      const mockPost = {
        ...createMockPost({
          id: 'post_123',
          hasRecipeDetails: true,
        }),
        tags: [
          { id: 'pt_1', postId: 'post_123', tagId: 'tag_1', tag: mockTags[0] },
          { id: 'pt_2', postId: 'post_123', tagId: 'tag_2', tag: mockTags[1] },
        ],
      } as any;

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Tagged Recipe',
        recipe: {
          ingredients: [{ name: 'Veggies', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Cook veggies' }],
          tags: ['vegetarian', 'quick'],
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      expect(prismaMock.tag.findMany).toHaveBeenCalledWith({
        where: {
          name: {
            in: ['vegetarian', 'quick'],
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({
                  tag: {
                    connect: {
                      id: 'tag_1',
                    },
                  },
                }),
                expect.objectContaining({
                  tag: {
                    connect: {
                      id: 'tag_2',
                    },
                  },
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('rejects invalid tags', async () => {
      // Only return 1 tag when 2 were requested
      prismaMock.tag.findMany.mockResolvedValue([
        {
          ...createMockTag({ id: 'tag_1', name: 'vegetarian' }),
          type: null,
        } as any,
      ]);

      const request = createFormDataRequest({
        title: 'Recipe with Invalid Tag',
        recipe: {
          ingredients: [{ name: 'Veggies', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Cook veggies' }],
          tags: ['vegetarian', 'nonexistent-tag'],
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INVALID_TAG');
      expect(data.error.message).toContain('not available');
    });

    it('creates post without tags when none provided', async () => {
      const mockPost = {
        ...createMockPost({
          id: 'post_123',
        }),
        tags: [],
      } as any;

      prismaMock.post.create.mockResolvedValue(mockPost as any);

      const request = createFormDataRequest({
        title: 'Untagged Post',
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(201);

      expect(prismaMock.tag.findMany).not.toHaveBeenCalled();
      expect(prismaMock.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            tags: expect.anything(),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('handles unsupported file type', async () => {
      mockSavePhotoFile.mockRejectedValue(new Error('UNSUPPORTED_FILE_TYPE'));

      const photos = [new File(['photo'], 'photo.txt', { type: 'text/plain' })];

      const request = createFormDataRequest(
        {
          title: 'Post with Bad File',
        },
        photos
      );

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(data.error.message).toContain('JPEG, PNG, WEBP, or GIF');
    });

    it('handles file too large', async () => {
      mockSavePhotoFile.mockRejectedValue(new Error('FILE_TOO_LARGE'));

      const photos = [
        new File(['x'.repeat(9 * 1024 * 1024)], 'large.jpg', {
          type: 'image/jpeg',
        }),
      ];

      const request = createFormDataRequest(
        {
          title: 'Post with Large File',
        },
        photos
      );

      const response = await POST(request, mockUser);
      expect(response.status).toBe(400);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('FILE_TOO_LARGE');
      expect(data.error.message).toContain('8MB');
    });

    it('handles database errors', async () => {
      prismaMock.post.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createFormDataRequest({
        title: 'Test Post',
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(500);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles tag lookup errors', async () => {
      prismaMock.tag.findMany.mockRejectedValue(new Error('Tag query failed'));

      const request = createFormDataRequest({
        title: 'Tagged Recipe',
        recipe: {
          ingredients: [{ name: 'Flour', quantity: 2, unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          tags: ['test-tag'],
        },
      });

      const response = await POST(request, mockUser);
      expect(response.status).toBe(500);

      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
