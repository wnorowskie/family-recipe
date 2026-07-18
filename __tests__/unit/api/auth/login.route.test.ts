import { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/login/route';

function buildRequest(
  body?: string,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /api/auth/login (FastAPI proxy)', () => {
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

    const response = await POST(buildRequest(JSON.stringify({})));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed JSON body', async () => {
    const response = await POST(buildRequest('{not json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the upstream fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    const response = await POST(
      buildRequest(JSON.stringify({ emailOrUsername: 'u', password: 'p' }))
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 502 when the upstream response is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>gateway error</html>', { status: 200 })
    );

    const response = await POST(
      buildRequest(JSON.stringify({ emailOrUsername: 'u', password: 'p' }))
    );

    expect(response.status).toBe(502);
  });

  it('proxies the body to /v1/auth/login and forwards status + Set-Cookie', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'access-1' }), {
        status: 200,
        headers: [
          ['content-type', 'application/json'],
          ['set-cookie', 'refresh_token=abc.def; Path=/; HttpOnly'],
          ['set-cookie', 'csrf_token=csrf-1; Path=/'],
        ],
      })
    );

    const payload = { emailOrUsername: 'u', password: 'p', rememberMe: true };
    const response = await POST(buildRequest(JSON.stringify(payload)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ accessToken: 'access-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.local/v1/auth/login');
    expect(JSON.parse(init.body)).toEqual(payload);
    // No client IP headers supplied → none synthesized on the upstream call.
    expect(init.headers['X-Forwarded-For']).toBeUndefined();
    expect(init.headers['X-Real-IP']).toBeUndefined();

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toContain('refresh_token=abc.def; Path=/; HttpOnly');
    expect(setCookies).toContain('csrf_token=csrf-1; Path=/');
  });

  it('forwards the client IP chain but never a spoofed hop-by-hop / auth header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'access-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const response = await POST(
      buildRequest(JSON.stringify({ emailOrUsername: 'u', password: 'p' }), {
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'x-real-ip': '203.0.113.7',
        // A client must not be able to smuggle the IAM bearer through the
        // allowlist — fetchUpstream sets X-Serverless-Authorization itself.
        'x-serverless-authorization': 'Bearer spoofed',
      })
    );

    expect(response.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Forwarded-For']).toBe('203.0.113.7, 10.0.0.1');
    expect(init.headers['X-Real-IP']).toBe('203.0.113.7');
    expect(init.headers['X-Serverless-Authorization']).toBeUndefined();
  });

  it('passes upstream error statuses through unchanged', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid' },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      )
    );

    const response = await POST(
      buildRequest(JSON.stringify({ emailOrUsername: 'u', password: 'bad' }))
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
