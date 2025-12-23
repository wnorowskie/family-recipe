import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedUser } from '@/lib/apiAuth';
import { getCurrentUser } from '@/lib/session';

// Mock the session module
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;

// Helper to create mock NextRequest
function createMockRequest(
  url = 'http://localhost:3000/api/test'
): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// Type matching getCurrentUser return type
type FullUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  emailOrUsername: string;
  avatarUrl: string | null;
  role: string;
  familySpaceId: string;
  familySpaceName: string;
};

// Helper to create mock authenticated user
function createMockUser(overrides?: Partial<FullUser>): FullUser {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    emailOrUsername: 'test@example.com',
    avatarUrl: null,
    familySpaceId: 'family-456',
    familySpaceName: 'Test Family',
    role: 'member',
    ...overrides,
  };
}

describe('withAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('calls handler when user is authenticated', async () => {
      const user = createMockUser();
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });

    it('passes context parameter to handler', async () => {
      const user = createMockUser();
      mockGetCurrentUser.mockResolvedValue(user);

      const context = { params: { id: 'test-123' } };
      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      await wrappedHandler(request, context);

      expect(handler).toHaveBeenCalledWith(request, user, context);
    });

    it('handles handler that returns NextResponse synchronously', async () => {
      const user = createMockUser();
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ data: 'sync' });
      const handler = jest.fn().mockReturnValue(mockResponse);
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(response).toBe(mockResponse);
    });
  });

  describe('User Context', () => {
    it('passes correct user context to handler', async () => {
      const user = createMockUser({
        id: 'user-abc',
        familySpaceId: 'family-xyz',
        role: 'admin',
        name: 'Admin User',
      });
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest
        .fn()
        .mockResolvedValue(NextResponse.json({ ok: true }));
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
    });
  });

  describe('Error Handling', () => {
    it('allows handler to throw errors', async () => {
      const user = createMockUser();
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withAuth(handler);
      const request = createMockRequest();

      await expect(wrappedHandler(request)).rejects.toThrow('Handler error');
    });
  });
});

describe('withRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withRole(['admin'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Authorization - Single Role', () => {
    it('accepts string as single allowed role', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole('admin', handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });

    it('returns 403 when user role does not match single allowed role', async () => {
      const user = createMockUser({ role: 'member' });
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest.fn();
      const wrappedHandler = withRole('admin', handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Authorization - Multiple Roles', () => {
    it('calls handler when user has one of the allowed roles (first role)', async () => {
      const user = createMockUser({ role: 'owner' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole(['owner', 'admin'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });

    it('calls handler when user has one of the allowed roles (second role)', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole(['owner', 'admin'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });

    it('returns 403 when user role is not in allowed roles', async () => {
      const user = createMockUser({ role: 'member' });
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest.fn();
      const wrappedHandler = withRole(['owner', 'admin'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('handles array with single role', async () => {
      const user = createMockUser({ role: 'owner' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole(['owner'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });

    it('handles array with three roles', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole(['owner', 'admin', 'moderator'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
      expect(response).toBe(mockResponse);
    });
  });

  describe('Context Parameter', () => {
    it('passes context parameter to handler', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const context = { params: { postId: 'post-123' } };
      const mockResponse = NextResponse.json({ success: true });
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withRole(['admin'], handler);
      const request = createMockRequest();

      await wrappedHandler(request, context);

      expect(handler).toHaveBeenCalledWith(request, user, context);
    });
  });

  describe('User Context', () => {
    it('passes correct user context to handler', async () => {
      const user = createMockUser({
        id: 'user-xyz',
        familySpaceId: 'family-abc',
        role: 'owner',
        name: 'Owner User',
      });
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest
        .fn()
        .mockResolvedValue(NextResponse.json({ ok: true }));
      const wrappedHandler = withRole(['owner'], handler);
      const request = createMockRequest();

      await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, user, undefined);
    });
  });

  describe('Error Handling', () => {
    it('allows handler to throw errors', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = withRole(['admin'], handler);
      const request = createMockRequest();

      await expect(wrappedHandler(request)).rejects.toThrow('Handler error');
    });
  });

  describe('Synchronous Handler', () => {
    it('handles handler that returns NextResponse synchronously', async () => {
      const user = createMockUser({ role: 'admin' });
      mockGetCurrentUser.mockResolvedValue(user);

      const mockResponse = NextResponse.json({ data: 'sync' });
      const handler = jest.fn().mockReturnValue(mockResponse);
      const wrappedHandler = withRole(['admin'], handler);
      const request = createMockRequest();

      const response = await wrappedHandler(request);

      expect(response).toBe(mockResponse);
    });
  });
});
