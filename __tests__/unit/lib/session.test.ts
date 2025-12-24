/**
 * Unit Tests: Session Management
 *
 * Tests for session and cookie management functions in src/lib/session.ts
 *
 * Coverage:
 * - setSessionCookie() - sets cookie with proper attributes
 * - clearSessionCookie() - clears session cookie
 * - getSessionFromRequest() - extracts and verifies JWT from cookie
 * - getCurrentUser() - retrieves full user data from session
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  getCurrentUser,
} from '@/lib/session';
import { verifyToken, JWTPayload } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { getSignedUploadUrl } from '@/lib/uploads';

// Mock jose library (used by jwt.ts)
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

// Mock dependencies
jest.mock('@/lib/jwt');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/uploads', () => ({
  getSignedUploadUrl: jest.fn(),
}));

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockFindUnique = prisma.user.findUnique as jest.MockedFunction<
  typeof prisma.user.findUnique
>;
const mockGetSignedUploadUrl = getSignedUploadUrl as jest.MockedFunction<
  typeof getSignedUploadUrl
>;

describe('Session Management', () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignedUploadUrl.mockReset();
    mockGetSignedUploadUrl.mockImplementation(
      async (key: string | null | undefined) => key ?? null
    );
  });

  // Helper to set NODE_ENV for testing
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value,
      writable: true,
    });
  };

  describe('setSessionCookie()', () => {
    it('sets cookie with correct default attributes (7 days)', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'test-jwt-token';

      setSessionCookie(response, token, false);

      const cookie = response.cookies.get('session');
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(token);

      // Verify attributes by checking the Set-Cookie header
      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('session=test-jwt-token');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('SameSite=lax');
      expect(setCookieHeader).toContain('Path=/');
      expect(setCookieHeader).toContain('Max-Age=604800'); // 7 days in seconds
    });

    it('sets cookie with extended expiration (30 days) when rememberMe is true', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'test-jwt-token-remember';

      setSessionCookie(response, token, true);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Max-Age=2592000'); // 30 days in seconds
    });

    it('sets secure flag in production environment', () => {
      setNodeEnv('production');
      const response = new NextResponse();
      const token = 'production-token';

      setSessionCookie(response, token, false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Secure');
    });

    it('does not set secure flag in development environment', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'dev-token';

      setSessionCookie(response, token, false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).not.toContain('Secure');
    });

    it('sets httpOnly flag for security', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'secure-token';

      setSessionCookie(response, token, false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('sets sameSite=lax for CSRF protection', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'csrf-protected-token';

      setSessionCookie(response, token, false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('SameSite=lax');
    });

    it('sets path=/ for site-wide availability', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      const token = 'path-token';

      setSessionCookie(response, token, false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Path=/');
    });

    it('handles different token values correctly', () => {
      setNodeEnv('development');
      const response1 = new NextResponse();
      const response2 = new NextResponse();

      setSessionCookie(response1, 'token-abc-123', false);
      setSessionCookie(response2, 'token-xyz-789', false);

      expect(response1.cookies.get('session')?.value).toBe('token-abc-123');
      expect(response2.cookies.get('session')?.value).toBe('token-xyz-789');
    });
  });

  describe('clearSessionCookie()', () => {
    it('clears session cookie by setting empty value and maxAge=0', () => {
      setNodeEnv('development');
      const response = new NextResponse();

      clearSessionCookie(response);

      const cookie = response.cookies.get('session');
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe('');

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('session=;');
      expect(setCookieHeader).toContain('Max-Age=0');
    });

    it('preserves httpOnly flag when clearing', () => {
      setNodeEnv('development');
      const response = new NextResponse();

      clearSessionCookie(response);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('preserves sameSite flag when clearing', () => {
      setNodeEnv('development');
      const response = new NextResponse();

      clearSessionCookie(response);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('SameSite=lax');
    });

    it('sets secure flag in production when clearing', () => {
      setNodeEnv('production');
      const response = new NextResponse();

      clearSessionCookie(response);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Secure');
    });

    it('preserves path=/ when clearing', () => {
      setNodeEnv('development');
      const response = new NextResponse();

      clearSessionCookie(response);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Path=/');
    });
  });

  describe('getSessionFromRequest()', () => {
    it('returns null when session cookie is missing', async () => {
      const request = new NextRequest('http://localhost/api/test');

      const result = await getSessionFromRequest(request);

      expect(result).toBeNull();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it('returns null when cookie value is empty', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=' },
      });

      const result = await getSessionFromRequest(request);

      expect(result).toBeNull();
    });

    it('extracts token and calls verifyToken with valid cookie', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_123',
        familySpaceId: 'family_456',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-jwt-token' },
      });

      const result = await getSessionFromRequest(request);

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-jwt-token');
      expect(result).toEqual(mockPayload);
    });

    it('returns null when verifyToken returns null (invalid token)', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=invalid-jwt-token' },
      });

      const result = await getSessionFromRequest(request);

      expect(mockVerifyToken).toHaveBeenCalledWith('invalid-jwt-token');
      expect(result).toBeNull();
    });

    it('returns null when verifyToken returns null (expired token)', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=expired-jwt-token' },
      });

      const result = await getSessionFromRequest(request);

      expect(result).toBeNull();
    });

    it('handles multiple cookies and extracts session cookie', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_789',
        familySpaceId: 'family_012',
        role: 'owner',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const request = new NextRequest('http://localhost/api/test', {
        headers: {
          cookie: 'other=value; session=multi-cookie-token; another=data',
        },
      });

      const result = await getSessionFromRequest(request);

      expect(mockVerifyToken).toHaveBeenCalledWith('multi-cookie-token');
      expect(result).toEqual(mockPayload);
    });
  });

  describe('getCurrentUser()', () => {
    it('returns null when session cookie is missing', async () => {
      const request = new NextRequest('http://localhost/api/test');

      const result = await getCurrentUser(request);

      expect(result).toBeNull();
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('returns null when JWT verification fails', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=invalid-token' },
      });

      const result = await getCurrentUser(request);

      expect(result).toBeNull();
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('returns full user data with valid session', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_123',
        familySpaceId: 'family_456',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const mockUser = {
        id: 'user_123',
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johnny',
        avatarStorageKey: 'avatars/john.jpg',
        memberships: [
          {
            role: 'member',
            familySpaceId: 'family_456',
            familySpace: {
              name: 'Doe Family',
            },
          },
        ],
      };
      mockFindUnique.mockResolvedValue(mockUser as any);
      mockGetSignedUploadUrl.mockResolvedValueOnce(
        'https://example.com/avatar.jpg'
      );

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-token' },
      });

      const result = await getCurrentUser(request);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        include: {
          memberships: {
            where: { familySpaceId: 'family_456' },
            include: { familySpace: true },
          },
        },
      });

      expect(result).toEqual({
        id: 'user_123',
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johnny',
        emailOrUsername: 'john@example.com',
        avatarUrl: 'https://example.com/avatar.jpg',
        role: 'member',
        familySpaceId: 'family_456',
        familySpaceName: 'Doe Family',
      });
    });

    it('returns null when user not found in database', async () => {
      const mockPayload: JWTPayload = {
        userId: 'nonexistent_user',
        familySpaceId: 'family_456',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);
      mockFindUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-token' },
      });

      const result = await getCurrentUser(request);

      expect(result).toBeNull();
    });

    it('returns null when user has no memberships', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_123',
        familySpaceId: 'family_456',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const mockUser = {
        id: 'user_123',
        name: 'No Membership User',
        email: 'nomember@example.com',
        username: 'nomember',
        avatarStorageKey: null,
        memberships: [],
      };
      mockFindUnique.mockResolvedValue(mockUser as any);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-token' },
      });

      const result = await getCurrentUser(request);

      expect(result).toBeNull();
    });

    it('handles user with null avatarUrl', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_789',
        familySpaceId: 'family_999',
        role: 'owner',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const mockUser = {
        id: 'user_789',
        name: 'Avatar-less User',
        email: 'noavatar@example.com',
        username: 'noavatar',
        avatarStorageKey: null,
        memberships: [
          {
            role: 'owner',
            familySpaceId: 'family_999',
            familySpace: {
              name: 'Test Family',
            },
          },
        ],
      };
      mockFindUnique.mockResolvedValue(mockUser as any);

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-token' },
      });

      const result = await getCurrentUser(request);

      expect(result?.avatarUrl).toBeNull();
    });

    it('handles different user roles correctly', async () => {
      const testRoles = ['member', 'owner', 'admin'];

      for (const role of testRoles) {
        jest.clearAllMocks();

        const mockPayload: JWTPayload = {
          userId: `user_${role}`,
          familySpaceId: 'family_456',
          role,
        };
        mockVerifyToken.mockResolvedValue(mockPayload);

        const mockUser = {
          id: `user_${role}`,
          name: `${role} User`,
          email: `${role}@example.com`,
          username: `${role}user`,
          avatarStorageKey: null,
          memberships: [
            {
              role,
              familySpaceId: 'family_456',
              familySpace: { name: 'Test Family' },
            },
          ],
        };
        mockFindUnique.mockResolvedValue(mockUser as any);

        const request = new NextRequest('http://localhost/api/test', {
          headers: { cookie: 'session=valid-token' },
        });

        const result = await getCurrentUser(request);

        expect(result?.role).toBe(role);
      }
    });

    it('returns null and logs error when database query fails', async () => {
      const mockPayload: JWTPayload = {
        userId: 'user_123',
        familySpaceId: 'family_456',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);
      mockFindUnique.mockRejectedValue(new Error('Database connection failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'session=valid-token' },
      });

      const result = await getCurrentUser(request);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching current user:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete login-to-access flow', async () => {
      setNodeEnv('development');

      // 1. Login: Set session cookie
      const loginResponse = new NextResponse();
      setSessionCookie(loginResponse, 'login-token', false);
      expect(loginResponse.cookies.get('session')?.value).toBe('login-token');

      // 2. Request with session: Get current user
      const mockPayload: JWTPayload = {
        userId: 'user_flow',
        familySpaceId: 'family_flow',
        role: 'member',
      };
      mockVerifyToken.mockResolvedValue(mockPayload);

      const mockUser = {
        id: 'user_flow',
        name: 'Flow User',
        email: 'flow@example.com',
        username: 'flowuser',
        avatarStorageKey: null,
        memberships: [
          {
            role: 'member',
            familySpaceId: 'family_flow',
            familySpace: { name: 'Flow Family' },
          },
        ],
      };
      mockFindUnique.mockResolvedValue(mockUser as any);

      const authenticatedRequest = new NextRequest(
        'http://localhost/api/posts',
        {
          headers: { cookie: 'session=login-token' },
        }
      );

      const user = await getCurrentUser(authenticatedRequest);
      expect(user).toEqual({
        id: 'user_flow',
        name: 'Flow User',
        email: 'flow@example.com',
        username: 'flowuser',
        emailOrUsername: 'flow@example.com',
        avatarUrl: null,
        role: 'member',
        familySpaceId: 'family_flow',
        familySpaceName: 'Flow Family',
      });

      // 3. Logout: Clear session cookie
      const logoutResponse = new NextResponse();
      clearSessionCookie(logoutResponse);
      expect(logoutResponse.cookies.get('session')?.value).toBe('');
    });

    it('handles remember me functionality correctly', async () => {
      setNodeEnv('development');

      // Set cookie with remember me (30 days)
      const response1 = new NextResponse();
      setSessionCookie(response1, 'remember-token', true);
      const setCookie1 = response1.headers.get('set-cookie');
      expect(setCookie1).toContain('Max-Age=2592000'); // 30 days

      // Set cookie without remember me (7 days)
      const response2 = new NextResponse();
      setSessionCookie(response2, 'no-remember-token', false);
      const setCookie2 = response2.headers.get('set-cookie');
      expect(setCookie2).toContain('Max-Age=604800'); // 7 days
    });

    it('rejects access when session is expired', async () => {
      mockVerifyToken.mockResolvedValue(null); // Expired token returns null

      const request = new NextRequest('http://localhost/api/protected', {
        headers: { cookie: 'session=expired-token' },
      });

      const user = await getCurrentUser(request);
      expect(user).toBeNull();
    });
  });

  describe('Security Features', () => {
    it('ensures httpOnly flag prevents JavaScript access to cookie', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      setSessionCookie(response, 'secure-token', false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('HttpOnly');
    });

    it('ensures sameSite flag provides CSRF protection', () => {
      setNodeEnv('development');
      const response = new NextResponse();
      setSessionCookie(response, 'csrf-protected', false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('SameSite=lax');
    });

    it('ensures secure flag in production for HTTPS-only transmission', () => {
      setNodeEnv('production');
      const response = new NextResponse();
      setSessionCookie(response, 'production-token', false);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('Secure');
    });
  });
});
