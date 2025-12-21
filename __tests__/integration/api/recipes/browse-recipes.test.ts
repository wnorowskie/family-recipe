import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { GET } from '@/app/api/recipes/route';

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

jest.mock('@/lib/recipes', () => ({
  getRecipes: jest.fn(),
}));

import { getCurrentUser } from '@/lib/session';
import { getRecipes } from '@/lib/recipes';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockGetRecipes = getRecipes as jest.MockedFunction<typeof getRecipes>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('GET /api/recipes', () => {
  const mockUser = {
    id: 'user_123',
    emailOrUsername: 'test@example.com',
    name: 'Test User',
    familySpaceId: 'family_123',
    familySpaceName: 'Test Family',
    role: 'member' as const,
    avatarUrl: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
  });

  describe('Authentication', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Pagination', () => {
    it('accepts request without query parameters (uses defaults)', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 20,
        offset: 0,
        sort: 'recent',
      });
    });

    it('accepts valid limit and offset parameters', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?limit=10&offset=20', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 10,
        offset: 20,
        sort: 'recent',
      });
    });

    it('rejects invalid limit', async () => {
      const request = new NextRequest('http://localhost/api/recipes?limit=-1', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid offset', async () => {
      const request = new NextRequest('http://localhost/api/recipes?offset=-5', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Search Filter', () => {
    it('filters by search query', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [
          {
            id: 'post_1',
            title: 'Chocolate Cake',
            mainPhotoUrl: null,
            author: { id: 'user_1', name: 'Alice', avatarUrl: null },
            courses: ['dessert'],
            primaryCourse: 'dessert',
            difficulty: 'easy',
            tags: ['chocolate', 'baking'],
            totalTime: 60,
            servings: 8,
            cookedStats: { timesCooked: 5, averageRating: 4.5 },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?search=chocolate', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 20,
        offset: 0,
        search: 'chocolate',
        sort: 'recent',
      });
    });

    it('rejects search query longer than 200 characters', async () => {
      const longQuery = 'a'.repeat(201);
      const request = new NextRequest(`http://localhost/api/recipes?search=${longQuery}`, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Course Filter', () => {
    it('filters by multiple courses', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?course=breakfast&course=lunch', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          courses: ['breakfast', 'lunch'],
        })
      );
    });

    it('rejects invalid course values', async () => {
      const request = new NextRequest('http://localhost/api/recipes?course=invalid', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('deduplicates course values', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?course=breakfast&course=breakfast', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          courses: ['breakfast'],
        })
      );
    });
  });

  describe('Tags Filter', () => {
    it('filters by single tag', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const url = new URL('http://localhost/api/recipes');
      url.searchParams.append('tags', 'vegetarian');
      const request = new NextRequest(url, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['vegetarian'],
        })
      );
    });

    it('filters by multiple tags', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?tags=vegetarian&tags=gluten-free', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['vegetarian', 'gluten-free'],
        })
      );
    });

    it('rejects more than 10 tags', async () => {
      const tags = Array(11).fill('tag').map((t, i) => `tags=${t}${i}`).join('&');
      const request = new NextRequest(`http://localhost/api/recipes?${tags}`, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Difficulty Filter', () => {
    it('filters by single difficulty', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const url = new URL('http://localhost/api/recipes');
      url.searchParams.append('difficulty', 'easy');
      const request = new NextRequest(url, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          difficulties: ['easy'],
        })
      );
    });

    it('filters by multiple difficulties', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?difficulty=easy&difficulty=medium', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          difficulties: ['easy', 'medium'],
        })
      );
    });

    it('rejects invalid difficulty values', async () => {
      const request = new NextRequest('http://localhost/api/recipes?difficulty=impossible', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('deduplicates difficulty values', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?difficulty=easy&difficulty=easy', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          difficulties: ['easy'],
        })
      );
    });
  });

  describe('Time Range Filter', () => {
    it('filters by minimum time', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?totalTimeMin=30', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          minTotalMinutes: 30,
        })
      );
    });

    it('filters by maximum time', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?totalTimeMax=60', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTotalMinutes: 60,
        })
      );
    });

    it('filters by time range', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?totalTimeMin=30&totalTimeMax=60', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          minTotalMinutes: 30,
          maxTotalMinutes: 60,
        })
      );
    });

    it('rejects minTime > maxTime', async () => {
      const request = new NextRequest('http://localhost/api/recipes?totalTimeMin=120&totalTimeMax=60', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative time values', async () => {
      const request = new NextRequest('http://localhost/api/recipes?totalTimeMin=-10', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Servings Range Filter', () => {
    it('filters by minimum servings', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?servingsMin=4', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          minServings: 4,
        })
      );
    });

    it('filters by maximum servings', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?servingsMax=8', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          maxServings: 8,
        })
      );
    });

    it('filters by servings range', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?servingsMin=2&servingsMax=6', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          minServings: 2,
          maxServings: 6,
        })
      );
    });

    it('rejects minServings > maxServings', async () => {
      const request = new NextRequest('http://localhost/api/recipes?servingsMin=10&servingsMax=4', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects servings less than 1', async () => {
      const request = new NextRequest('http://localhost/api/recipes?servingsMin=0', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Ingredients Filter', () => {
    it('filters by single ingredient', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const url = new URL('http://localhost/api/recipes');
      url.searchParams.append('ingredients', 'flour');
      const request = new NextRequest(url, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: ['flour'],
        })
      );
    });

    it('filters by multiple ingredients', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?ingredients=flour&ingredients=sugar', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: ['flour', 'sugar'],
        })
      );
    });

    it('rejects more than 5 ingredients', async () => {
      const ingredients = Array(6).fill('ingredient').map((t, i) => `ingredients=${t}${i}`).join('&');
      const request = new NextRequest(`http://localhost/api/recipes?${ingredients}`, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Author Filter', () => {
    it('filters by single author', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const url = new URL('http://localhost/api/recipes');
      url.searchParams.append('authorId', 'clh0000000000000000000001');
      const request = new NextRequest(url, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          authorIds: ['clh0000000000000000000001'],
        })
      );
    });

    it('filters by multiple authors', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?authorId=clh0000000000000000000001&authorId=clh0000000000000000000002', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          authorIds: ['clh0000000000000000000001', 'clh0000000000000000000002'],
        })
      );
    });

    it('rejects invalid author ID format', async () => {
      const request = new NextRequest('http://localhost/api/recipes?authorId=invalid_id', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Sort Options', () => {
    it('sorts by recent (default)', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'recent',
        })
      );
    });

    it('sorts alphabetically when specified', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes?sort=alpha', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'alpha',
        })
      );
    });

    it('rejects invalid sort values', async () => {
      const request = new NextRequest('http://localhost/api/recipes?sort=popularity', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Combined Filters', () => {
    it('applies multiple filters together', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [
          {
            id: 'post_1',
            title: 'Quick Pasta',
            mainPhotoUrl: '/uploads/pasta.jpg',
            author: { id: 'user_1', name: 'Alice', avatarUrl: null },
            courses: ['lunch'],
            primaryCourse: 'lunch',
            difficulty: 'easy',
            tags: ['quick', 'italian'],
            totalTime: 20,
            servings: 4,
            cookedStats: { timesCooked: 10, averageRating: 4.8 },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const url = new URL('http://localhost/api/recipes');
      url.searchParams.append('search', 'pasta');
      url.searchParams.append('course', 'lunch');
      url.searchParams.append('difficulty', 'easy');
      url.searchParams.append('totalTimeMax', '30');
      url.searchParams.append('servingsMin', '2');
      url.searchParams.append('servingsMax', '6');
      url.searchParams.append('sort', 'alpha');
      const request = new NextRequest(url, {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetRecipes).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 20,
        offset: 0,
        search: 'pasta',
        courses: ['lunch'],
        difficulties: ['easy'],
        maxTotalMinutes: 30,
        minServings: 2,
        maxServings: 6,
        sort: 'alpha',
      });

      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe('Quick Pasta');
    });
  });

  describe('Success Cases', () => {
    it('returns empty array when no recipes match filters', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toEqual([]);
      expect(data.hasMore).toBe(false);
    });

    it('returns recipes with complete data structure', async () => {
      mockGetRecipes.mockResolvedValue({
        items: [
          {
            id: 'post_1',
            title: 'Chocolate Cake',
            mainPhotoUrl: '/uploads/cake.jpg',
            author: {
              id: 'user_1',
              name: 'Alice',
              avatarUrl: '/avatars/alice.jpg',
            },
            courses: ['dessert'],
            primaryCourse: 'dessert',
            difficulty: 'medium',
            tags: ['chocolate', 'baking', 'celebration'],
            totalTime: 90,
            servings: 12,
            cookedStats: {
              timesCooked: 15,
              averageRating: 4.7,
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      
      const recipe = data.items[0];
      expect(recipe).toMatchObject({
        id: 'post_1',
        title: 'Chocolate Cake',
        mainPhotoUrl: '/uploads/cake.jpg',
        author: {
          id: 'user_1',
          name: 'Alice',
          avatarUrl: '/avatars/alice.jpg',
        },
        courses: ['dessert'],
        primaryCourse: 'dessert',
        difficulty: 'medium',
        tags: ['chocolate', 'baking', 'celebration'],
        totalTime: 90,
        servings: 12,
        cookedStats: {
          timesCooked: 15,
          averageRating: 4.7,
        },
      });
    });

    it('returns pagination metadata', async () => {
      mockGetRecipes.mockResolvedValue({
        items: Array(20).fill(null).map((_, i) => ({
          id: `post_${i}`,
          title: `Recipe ${i}`,
          mainPhotoUrl: null,
          author: { id: 'user_1', name: 'Alice', avatarUrl: null },
          courses: ['lunch'],
          primaryCourse: 'lunch',
          difficulty: 'easy',
          tags: [],
          totalTime: 30,
          servings: 4,
          cookedStats: { timesCooked: 0, averageRating: null },
        })),
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(20);
      expect(data.hasMore).toBe(true);
      expect(data.nextOffset).toBe(20);
    });
  });

  describe('Error Handling', () => {
    it('handles errors from getRecipes helper', async () => {
      mockGetRecipes.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/recipes', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
