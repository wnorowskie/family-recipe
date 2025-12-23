import { NextRequest } from 'next/server';
import { prismaMock } from '../../helpers/mock-prisma';
import { GET as listNotifications } from '@/app/api/notifications/route';
import { POST as markRead } from '@/app/api/notifications/mark-read/route';
import { GET as unreadCount } from '@/app/api/notifications/unread-count/route';
import { createMockNotification } from '../../helpers/test-data';

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

jest.mock('@/lib/uploads', () => ({
  createSignedUrlResolver: jest.fn(() => mockResolveUrl),
}));

import { getCurrentUser } from '@/lib/session';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;

const parseResponseJSON = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

describe('Notifications API', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(mockUser);
    mockResolveUrl.mockReset();
    mockResolveUrl.mockImplementation(async (key?: string | null) =>
      key ? `https://signed.example/${key}` : null
    );
  });

  describe('GET /api/notifications', () => {
    it('requires authentication', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/notifications', {
        method: 'GET',
      });

      const response = await listNotifications(request);

      expect(response.status).toBe(401);
      const data = await parseResponseJSON(response);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('returns notifications with pagination metadata', async () => {
      const notification = createMockNotification({
        id: 'notif_1',
        type: 'comment',
      });

      prismaMock.notification.findMany.mockResolvedValue([
        {
          ...notification,
          actor: {
            id: 'actor_1',
            name: 'Chef Sam',
            avatarStorageKey: 'avatars/chef.png',
          },
          post: {
            id: 'post_1',
            title: 'Lemon Chicken',
            mainPhotoStorageKey: 'photos/lemon.png',
          },
        } as any,
      ]);
      prismaMock.notification.count.mockResolvedValue(1);

      const request = new NextRequest(
        'http://localhost/api/notifications?limit=10&offset=0',
        { method: 'GET' }
      );

      const response = await listNotifications(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].actor.avatarUrl).toBe(
        'https://signed.example/avatars/chef.png'
      );
      expect(data.notifications[0].post.mainPhotoUrl).toBe(
        'https://signed.example/photos/lemon.png'
      );
      expect(data.unreadCount).toBe(1);
      expect(data.hasMore).toBe(false);
      expect(data.nextOffset).toBe(1);
    });
  });

  describe('POST /api/notifications/mark-read', () => {
    it('marks notifications by id', async () => {
      const request = new NextRequest(
        'http://localhost/api/notifications/mark-read',
        {
          method: 'POST',
          body: JSON.stringify({ ids: ['clh0000000000000000000001'] }),
        }
      );

      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 } as any);
      prismaMock.notification.count.mockResolvedValue(0);

      const response = await markRead(request);

      expect(response.status).toBe(200);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: {
          recipientId: mockUser.id,
          id: { in: ['clh0000000000000000000001'] },
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
      const data = await parseResponseJSON(response);
      expect(data.unreadCount).toBe(0);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('returns unread count', async () => {
      prismaMock.notification.count.mockResolvedValue(3);

      const request = new NextRequest(
        'http://localhost/api/notifications/unread-count',
        { method: 'GET' }
      );

      const response = await unreadCount(request);

      expect(response.status).toBe(200);
      const data = await parseResponseJSON(response);
      expect(data.unreadCount).toBe(3);
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { recipientId: mockUser.id, readAt: null },
      });
    });
  });
});
