import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { GET } from '@/app/api/timeline/route';

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

jest.mock('@/lib/timeline-data', () => ({
  getTimelineFeed: jest.fn(),
}));

import { getCurrentUser } from '@/lib/session';
import { getTimelineFeed } from '@/lib/timeline-data';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockGetTimelineFeed = getTimelineFeed as jest.MockedFunction<typeof getTimelineFeed>;

// Helper to parse response JSON
const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('GET /api/timeline', () => {
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

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('accepts request without query parameters (uses defaults)', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetTimelineFeed).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 20,
        offset: 0,
      });
    });

    it('accepts valid limit parameter', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline?limit=10', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetTimelineFeed).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 10,
        offset: 0,
      });
    });

    it('accepts valid offset parameter', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline?offset=20', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetTimelineFeed).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 20,
        offset: 20,
      });
    });

    it('accepts both limit and offset parameters', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [],
        hasMore: true,
        nextOffset: 30,
      });

      const request = new NextRequest('http://localhost/api/timeline?limit=10&offset=20', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockGetTimelineFeed).toHaveBeenCalledWith({
        familySpaceId: 'family_123',
        limit: 10,
        offset: 20,
      });
    });

    it('rejects invalid limit parameter', async () => {
      const request = new NextRequest('http://localhost/api/timeline?limit=-1', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects limit exceeding maximum', async () => {
      const request = new NextRequest('http://localhost/api/timeline?limit=101', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative offset parameter', async () => {
      const request = new NextRequest('http://localhost/api/timeline?offset=-5', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Success Cases - Timeline Items', () => {
    it('returns empty timeline when no activity exists', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toEqual([]);
      expect(data.hasMore).toBe(false);
      expect(data.nextOffset).toBe(0);
    });

    it('returns timeline with post_created activity', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'post-clh001',
            type: 'post_created',
            timestamp: new Date('2024-01-01T10:00:00.000Z'),
            actor: {
              id: 'user_1',
              name: 'Alice',
              avatarUrl: null,
            },
            post: {
              id: 'clh001',
              title: 'Chocolate Cake',
              mainPhotoUrl: '/uploads/cake.jpg',
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].type).toBe('post_created');
      expect(data.items[0].actor.name).toBe('Alice');
      expect(data.items[0].post.title).toBe('Chocolate Cake');
    });

    it('returns timeline with comment_added activity', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'comment-clh101',
            type: 'comment_added',
            timestamp: new Date('2024-01-02T10:00:00.000Z'),
            actor: {
              id: 'user_2',
              name: 'Bob',
              avatarUrl: null,
            },
            post: {
              id: 'clh001',
              title: 'Chocolate Cake',
              mainPhotoUrl: '/uploads/cake.jpg',
            },
            comment: {
              id: 'clh101',
              text: 'This looks delicious!',
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].type).toBe('comment_added');
      expect(data.items[0].comment.text).toBe('This looks delicious!');
    });

    it('returns timeline with cooked_logged activity', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'cooked-clh201',
            type: 'cooked_logged',
            timestamp: new Date('2024-01-03T10:00:00.000Z'),
            actor: {
              id: 'user_3',
              name: 'Charlie',
              avatarUrl: null,
            },
            post: {
              id: 'clh001',
              title: 'Chocolate Cake',
              mainPhotoUrl: '/uploads/cake.jpg',
            },
            cooked: {
              rating: 5,
              note: 'Turned out amazing!',
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].type).toBe('cooked_logged');
      expect(data.items[0].cooked.rating).toBe(5);
      expect(data.items[0].cooked.note).toBe('Turned out amazing!');
    });

    it('returns timeline with post_edited activity', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'edit-clh001-1234567890',
            type: 'post_edited',
            timestamp: new Date('2024-01-04T10:00:00.000Z'),
            actor: {
              id: 'user_1',
              name: 'Alice',
              avatarUrl: null,
            },
            post: {
              id: 'clh001',
              title: 'Chocolate Cake (Updated)',
              mainPhotoUrl: '/uploads/cake.jpg',
            },
            edit: {
              note: 'Updated baking time',
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].type).toBe('post_edited');
      expect(data.items[0].edit.note).toBe('Updated baking time');
    });

    it('returns timeline with reaction_added activity', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'reaction-clh301',
            type: 'reaction_added',
            timestamp: new Date('2024-01-05T10:00:00.000Z'),
            actor: {
              id: 'user_4',
              name: 'Diana',
              avatarUrl: null,
            },
            post: {
              id: 'clh001',
              title: 'Chocolate Cake',
              mainPhotoUrl: '/uploads/cake.jpg',
            },
            reaction: {
              emoji: '❤️',
            },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].type).toBe('reaction_added');
      expect(data.items[0].reaction.emoji).toBe('❤️');
    });

    it('returns timeline with mixed activity types', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'post-clh002',
            type: 'post_created',
            timestamp: new Date('2024-01-06T10:00:00.000Z'),
            actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
            post: { id: 'clh002', title: 'Pasta', mainPhotoUrl: null },
          },
          {
            id: 'comment-clh102',
            type: 'comment_added',
            timestamp: new Date('2024-01-05T10:00:00.000Z'),
            actor: { id: 'user_2', name: 'Bob', avatarUrl: null },
            post: { id: 'clh001', title: 'Cake', mainPhotoUrl: null },
            comment: { id: 'clh102', text: 'Great!' },
          },
          {
            id: 'cooked-clh202',
            type: 'cooked_logged',
            timestamp: new Date('2024-01-04T10:00:00.000Z'),
            actor: { id: 'user_3', name: 'Charlie', avatarUrl: null },
            post: { id: 'clh001', title: 'Cake', mainPhotoUrl: null },
            cooked: { rating: 4, note: null },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(3);
      expect(data.items[0].type).toBe('post_created');
      expect(data.items[1].type).toBe('comment_added');
      expect(data.items[2].type).toBe('cooked_logged');
    });

    it('orders timeline items by timestamp descending', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: [
          {
            id: 'event-1',
            type: 'post_created',
            timestamp: new Date('2024-01-06T10:00:00.000Z'),
            actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
            post: { id: 'post_1', title: 'Latest', mainPhotoUrl: null },
          },
          {
            id: 'event-2',
            type: 'comment_added',
            timestamp: new Date('2024-01-05T10:00:00.000Z'),
            actor: { id: 'user_2', name: 'Bob', avatarUrl: null },
            post: { id: 'post_2', title: 'Middle', mainPhotoUrl: null },
            comment: { id: 'comment_1', text: 'Middle comment' },
          },
          {
            id: 'event-3',
            type: 'cooked_logged',
            timestamp: new Date('2024-01-04T10:00:00.000Z'),
            actor: { id: 'user_3', name: 'Charlie', avatarUrl: null },
            post: { id: 'post_3', title: 'Oldest', mainPhotoUrl: null },
            cooked: { rating: 5, note: null },
          },
        ],
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.items).toHaveLength(3);
      // Verify descending order
      expect(data.items[0].timestamp > data.items[1].timestamp).toBe(true);
      expect(data.items[1].timestamp > data.items[2].timestamp).toBe(true);
      expect(data.items[0].post.title).toBe('Latest');
      expect(data.items[2].post.title).toBe('Oldest');
    });
  });

  describe('Pagination', () => {
    it('returns hasMore: true when more items exist', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: Array(20).fill(null).map((_, i) => ({
          id: `post-${i}`,
          type: 'post_created',
          timestamp: new Date(),
          actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
          post: { id: `post_${i}`, title: `Post ${i}`, mainPhotoUrl: null },
        })),
        hasMore: true,
        nextOffset: 20,
      });

      const request = new NextRequest('http://localhost/api/timeline?limit=20', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.hasMore).toBe(true);
      expect(data.nextOffset).toBe(20);
    });

    it('returns hasMore: false when no more items exist', async () => {
      mockGetTimelineFeed.mockResolvedValue({
        items: Array(10).fill(null).map((_, i) => ({
          id: `post-${i}`,
          type: 'post_created',
          timestamp: new Date(),
          actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
          post: { id: `post_${i}`, title: `Post ${i}`, mainPhotoUrl: null },
        })),
        hasMore: false,
        nextOffset: 0,
      });

      const request = new NextRequest('http://localhost/api/timeline?limit=20', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.hasMore).toBe(false);
      expect(data.nextOffset).toBe(0);
    });

    it('supports pagination through multiple pages', async () => {
      // First page
      mockGetTimelineFeed.mockResolvedValueOnce({
        items: Array(10).fill(null).map((_, i) => ({
          id: `post-${i}`,
          type: 'post_created',
          timestamp: new Date(),
          actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
          post: { id: `post_${i}`, title: `Post ${i}`, mainPhotoUrl: null },
        })),
        hasMore: true,
        nextOffset: 10,
      });

      const request1 = new NextRequest('http://localhost/api/timeline?limit=10', {
        method: 'GET',
      });
      const response1 = await GET(request1);
      const data1 = await parseResponseJSON(response1);

      expect(data1.hasMore).toBe(true);
      expect(data1.nextOffset).toBe(10);

      // Second page
      mockGetTimelineFeed.mockResolvedValueOnce({
        items: Array(10).fill(null).map((_, i) => ({
          id: `post-${i + 10}`,
          type: 'post_created',
          timestamp: new Date(),
          actor: { id: 'user_1', name: 'Alice', avatarUrl: null },
          post: { id: `post_${i + 10}`, title: `Post ${i + 10}`, mainPhotoUrl: null },
        })),
        hasMore: false,
        nextOffset: 0,
      });

      const request2 = new NextRequest('http://localhost/api/timeline?limit=10&offset=10', {
        method: 'GET',
      });
      const response2 = await GET(request2);
      const data2 = await parseResponseJSON(response2);

      expect(data2.hasMore).toBe(false);
      expect(data2.nextOffset).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('handles errors from getTimelineFeed', async () => {
      mockGetTimelineFeed.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/timeline', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles malformed query parameters gracefully', async () => {
      const request = new NextRequest('http://localhost/api/timeline?limit=abc', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
