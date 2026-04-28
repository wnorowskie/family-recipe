import { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/bootstrap/route';

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
}));

const fixtureUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  emailOrUsername: 'test@example.com',
  avatarUrl: null,
  role: 'member',
  familySpaceId: 'family-1',
  familySpaceName: 'Test Family',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function buildRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/bootstrap', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/auth/bootstrap', () => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://api.local';
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    }
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns 500 when NEXT_PUBLIC_API_BASE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const response = await POST(buildRequest({ cookie: 'csrf_token=x' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 when no cookies are present', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 when csrf_token cookie is missing', async () => {
    const response = await POST(buildRequest({ cookie: 'refresh_token=abc' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards cookies and CSRF header to /v1/auth/refresh', async () => {
    const refreshSetCookie = [
      'refresh_token=new.cookie.value; Path=/; HttpOnly; SameSite=Lax',
      'csrf_token=new-csrf; Path=/; SameSite=Lax',
    ];
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-1' }), {
          status: 200,
          headers: [
            ['content-type', 'application/json'],
            ['set-cookie', refreshSetCookie[0]],
            ['set-cookie', refreshSetCookie[1]],
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ user: fixtureUser }));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ accessToken: 'access-1', user: fixtureUser });

    const refreshCall = fetchMock.mock.calls[0];
    expect(refreshCall[0]).toBe('http://api.local/v1/auth/refresh');
    expect(refreshCall[1].headers.Cookie).toBe(
      'refresh_token=opaque; csrf_token=csrf-abc'
    );
    expect(refreshCall[1].headers['X-CSRF-Token']).toBe('csrf-abc');

    const meCall = fetchMock.mock.calls[1];
    expect(meCall[0]).toBe('http://api.local/v1/auth/me');
    expect(meCall[1].headers.Authorization).toBe('Bearer access-1');
  });

  it('forwards rotated Set-Cookie headers from /v1/auth/refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'access-1' }), {
          status: 200,
          headers: [
            ['content-type', 'application/json'],
            ['set-cookie', 'refresh_token=rotated; Path=/; HttpOnly'],
            ['set-cookie', 'csrf_token=rotated-csrf; Path=/'],
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ user: fixtureUser }));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain('refresh_token=rotated; Path=/; HttpOnly');
    expect(setCookies).toContain('csrf_token=rotated-csrf; Path=/');
  });

  it('returns 401 when /v1/auth/refresh returns non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'reuse' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when refresh returns malformed body (no accessToken)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when /v1/auth/me rejects the access token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-1' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid' }), { status: 401 })
      );

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 502 when /v1/auth/refresh network call fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );

    expect(response.status).toBe(502);
  });

  it('returns 502 when /v1/auth/me network call fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'access-1' }))
      .mockRejectedValueOnce(new Error('connection refused'));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=opaque; csrf_token=csrf-abc' })
    );

    expect(response.status).toBe(502);
  });
});
