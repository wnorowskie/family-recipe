import { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/logout/route';

function buildRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/auth/logout (FastAPI proxy)', () => {
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

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the upstream fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const response = await POST(buildRequest({ cookie: 'refresh_token=abc' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('forwards cookies and the csrf_token as X-CSRF-Token to /v1/auth/logout', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await POST(
      buildRequest({ cookie: 'refresh_token=abc.def; csrf_token=csrf%2D1' })
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.local/v1/auth/logout');
    expect(init.headers.Cookie).toBe(
      'refresh_token=abc.def; csrf_token=csrf%2D1'
    );
    expect(init.headers['X-CSRF-Token']).toBe('csrf-1');
  });

  it('omits Cookie and X-CSRF-Token headers when the request has no cookies', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Cookie).toBeUndefined();
    expect(init.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('forwards cookie-clearing Set-Cookie headers from upstream', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: [
          ['set-cookie', 'refresh_token=; Path=/; Max-Age=0'],
          ['set-cookie', 'csrf_token=; Path=/; Max-Age=0'],
        ],
      })
    );

    const response = await POST(buildRequest({ cookie: 'refresh_token=abc' }));

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain('refresh_token=; Path=/; Max-Age=0');
    expect(setCookies).toContain('csrf_token=; Path=/; Max-Age=0');
  });

  it('passes upstream non-2xx statuses through', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const response = await POST(buildRequest({ cookie: 'refresh_token=x' }));

    expect(response.status).toBe(401);
  });
});
