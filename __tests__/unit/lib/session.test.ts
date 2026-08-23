/**
 * Unit Tests: Session helpers (FastAPI-only)
 *
 * After the Phase 4.4 cutover the legacy Next JWT/cookie session helpers were
 * deleted. What remains:
 * - resolvePageUser()          (src/lib/session.ts) — resolves the (app) page
 *   user via FastAPI's non-rotating /v1/auth/session endpoint.
 * - hasRefreshTokenFromRequest() (src/lib/session-core.ts) — Edge-safe,
 *   presence-only refresh_token cookie check used by the middleware.
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { resolvePageUser } from '@/lib/session';
import { fetchSessionUser } from '@/lib/auth/bootstrapFromCookies';
import { hasRefreshTokenFromRequest } from '@/lib/session-core';
import type { AuthUser } from '@/lib/authStore';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/lib/auth/bootstrapFromCookies', () => ({
  fetchSessionUser: jest.fn(),
}));

const mockHeaders = headers as jest.MockedFunction<typeof headers>;
const mockFetchSessionUser = fetchSessionUser as jest.MockedFunction<
  typeof fetchSessionUser
>;

const buildUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'user_123',
  name: 'John Doe',
  email: 'john@example.com',
  username: 'johnny',
  emailOrUsername: 'john@example.com',
  avatarUrl: null,
  role: 'member',
  familySpaceId: 'family_456',
  familySpaceName: 'Doe Family',
  ...overrides,
});

// Mock the Next headers() store so resolvePageUser can read the cookie header
// (and, since #265, the forwarded client-IP headers).
const mockCookieHeader = (
  value: string | null,
  extra: Record<string, string> = {}
) => {
  mockHeaders.mockResolvedValue({
    get: (name: string) =>
      name === 'cookie' ? value : (extra[name.toLowerCase()] ?? null),
  } as unknown as Awaited<ReturnType<typeof headers>>);
};

describe('resolvePageUser()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the user when the session call succeeds', async () => {
    const user = buildUser();
    mockCookieHeader('refresh_token=opaque; csrf_token=abc');
    mockFetchSessionUser.mockResolvedValue({ ok: true, user });

    const result = await resolvePageUser();

    expect(result).toEqual(user);
  });

  it('forwards the incoming cookie header to fetchSessionUser', async () => {
    mockCookieHeader('refresh_token=opaque; csrf_token=abc');
    mockFetchSessionUser.mockResolvedValue({ ok: true, user: buildUser() });

    await resolvePageUser();

    expect(mockFetchSessionUser).toHaveBeenCalledWith(
      'refresh_token=opaque; csrf_token=abc',
      {}
    );
  });

  it('passes a null cookie header through when no cookie is present', async () => {
    mockCookieHeader(null);
    mockFetchSessionUser.mockResolvedValue({ ok: true, user: buildUser() });

    await resolvePageUser();

    expect(mockFetchSessionUser).toHaveBeenCalledWith(null, {});
  });

  it('forwards the browser client-IP headers to fetchSessionUser (#265)', async () => {
    mockCookieHeader('refresh_token=opaque; csrf_token=abc', {
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      'x-real-ip': '203.0.113.7',
    });
    mockFetchSessionUser.mockResolvedValue({ ok: true, user: buildUser() });

    await resolvePageUser();

    expect(mockFetchSessionUser).toHaveBeenCalledWith(
      'refresh_token=opaque; csrf_token=abc',
      { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1', 'X-Real-IP': '203.0.113.7' }
    );
  });

  it('returns null when the session call fails', async () => {
    mockCookieHeader('refresh_token=opaque');
    mockFetchSessionUser.mockResolvedValue({
      ok: false,
      reason: 'SESSION_FAILED',
    });

    const result = await resolvePageUser();

    expect(result).toBeNull();
  });
});

describe('hasRefreshTokenFromRequest()', () => {
  it('returns false when the refresh_token cookie is absent', () => {
    const request = new NextRequest('http://localhost/timeline');
    expect(hasRefreshTokenFromRequest(request)).toBe(false);
  });

  it('returns false when the refresh_token cookie value is an empty string', () => {
    const request = new NextRequest('http://localhost/timeline', {
      headers: { cookie: 'refresh_token=' },
    });
    expect(hasRefreshTokenFromRequest(request)).toBe(false);
  });

  it('returns true for a non-empty refresh_token cookie', () => {
    const request = new NextRequest('http://localhost/timeline', {
      headers: { cookie: 'refresh_token=opaque.jti.value' },
    });
    expect(hasRefreshTokenFromRequest(request)).toBe(true);
  });

  it('returns true regardless of other cookies being present', () => {
    const request = new NextRequest('http://localhost/timeline', {
      headers: { cookie: 'csrf_token=abc; refresh_token=opaque' },
    });
    expect(hasRefreshTokenFromRequest(request)).toBe(true);
  });
});
