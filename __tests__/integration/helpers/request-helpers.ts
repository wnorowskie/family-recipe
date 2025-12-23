/**
 * Request Helper Utilities
 *
 * Helper functions for creating mock Next.js requests in tests.
 * Provides convenient builders for authenticated and unauthenticated requests.
 */

import { NextRequest } from 'next/server';

/**
 * Create an authenticated request with a mock JWT token
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param url - Full URL including protocol and host
 * @param body - Optional request body (will be JSON stringified)
 * @param userId - Optional user ID for the mock token (default: 'user_test123')
 * @returns NextRequest with auth cookie set
 */
export const createAuthenticatedRequest = (
  method: string,
  url: string,
  body?: any,
  userId: string = 'user_test123'
): NextRequest => {
  let normalizedBody = body;

  const shouldNormalizeSignup = url.includes('/api/auth/signup');

  if (
    shouldNormalizeSignup &&
    normalizedBody &&
    typeof normalizedBody === 'object' &&
    'emailOrUsername' in normalizedBody &&
    (!('email' in normalizedBody) || !('username' in normalizedBody))
  ) {
    const identifier = (normalizedBody as any).emailOrUsername;
    const fallbackUsername =
      typeof identifier === 'string'
        ? identifier.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user'
        : 'user';

    normalizedBody = {
      ...normalizedBody,
      email: (normalizedBody as any).email ?? identifier,
      username: (normalizedBody as any).username ?? fallbackUsername,
    };
  }

  // Create a mock JWT token (in tests, JWT verification is mocked)
  const mockToken = `mock-jwt-${userId}`;

  const headers = new Headers();
  headers.set('cookie', `auth_token=${mockToken}`);

  if (normalizedBody) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method,
    headers,
    body: normalizedBody ? JSON.stringify(normalizedBody) : undefined,
  });
};

/**
 * Create an unauthenticated request (no auth cookie)
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param url - Full URL including protocol and host
 * @param body - Optional request body (will be JSON stringified)
 * @returns NextRequest without auth cookie
 */
export const createUnauthenticatedRequest = (
  method: string,
  url: string,
  body?: any
): NextRequest => {
  let normalizedBody = body;
  const shouldNormalizeSignup = url.includes('/api/auth/signup');

  if (
    shouldNormalizeSignup &&
    normalizedBody &&
    typeof normalizedBody === 'object' &&
    'emailOrUsername' in normalizedBody &&
    (!('email' in normalizedBody) || !('username' in normalizedBody))
  ) {
    const identifier = (normalizedBody as any).emailOrUsername;
    const fallbackUsername =
      typeof identifier === 'string'
        ? identifier.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user'
        : 'user';

    normalizedBody = {
      ...normalizedBody,
      email: (normalizedBody as any).email ?? identifier,
      username: (normalizedBody as any).username ?? fallbackUsername,
    };
  }

  const headers = new Headers();

  if (normalizedBody) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method,
    headers,
    body: normalizedBody ? JSON.stringify(normalizedBody) : undefined,
  });
};

/**
 * Create a request with custom headers
 *
 * @param method - HTTP method
 * @param url - Full URL
 * @param options - Request options including headers and body
 * @returns NextRequest with custom configuration
 */
export const createRequestWithHeaders = (
  method: string,
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: any;
    cookies?: Record<string, string>;
  } = {}
): NextRequest => {
  const headers = new Headers();

  // Add custom headers
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  // Add cookies
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('cookie', cookieString);
  }

  // Set content type if body exists
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
};

/**
 * Parse response JSON safely
 * Useful for extracting response data in tests
 *
 * @param response - NextResponse or Response object
 * @returns Parsed JSON data
 */
export const parseResponseJSON = async (response: Response): Promise<any> => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse response JSON: ${text}`);
  }
};

/**
 * Create a mock context object for dynamic routes
 * Used when testing routes like /api/posts/[postId]
 *
 * @param params - Route parameters
 * @returns Context object for route handler
 */
export const createMockContext = (params: Record<string, string>) => ({
  params,
});
