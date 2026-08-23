import { NextRequest } from 'next/server';

import { DELETE, GET, HEAD, POST } from '@/app/v1/[...path]/route';

function buildRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers: init.headers,
    body: init.body,
  });
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe('/v1/[...path] (FastAPI same-origin proxy)', () => {
  const originalFetch = global.fetch;
  const originalInternalUrl = process.env.API_INTERNAL_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.API_INTERNAL_URL = 'https://api.internal';
  });

  afterEach(() => {
    if (originalInternalUrl === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = originalInternalUrl;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('forwards the path and query string to FastAPI under /v1', async () => {
    await GET(
      buildRequest('http://localhost:3000/v1/posts?limit=5&cursor=abc'),
      context(['posts'])
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.internal/v1/posts?limit=5&cursor=abc'
    );
  });

  it('forwards nested paths', async () => {
    await GET(
      buildRequest('http://localhost:3000/v1/posts/abc123/comments'),
      context(['posts', 'abc123', 'comments'])
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.internal/v1/posts/abc123/comments'
    );
  });

  it("passes the caller's Authorization header through untouched", async () => {
    await GET(
      buildRequest('http://localhost:3000/v1/posts', {
        headers: { authorization: 'Bearer user-token' },
      }),
      context(['posts'])
    );

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      authorization: 'Bearer user-token',
    });
  });

  it('drops a client-supplied X-Serverless-Authorization header', async () => {
    // Without this the header carrying our IAM assertion would be attacker
    // controlled on the hop to Cloud Run.
    await GET(
      buildRequest('http://localhost:3000/v1/posts', {
        headers: { 'x-serverless-authorization': 'Bearer forged' },
      }),
      context(['posts'])
    );

    const headers = fetchMock.mock.calls[0][1].headers;
    const forwarded = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'x-serverless-authorization'
    );
    expect(forwarded).toBeUndefined();
  });

  it('forwards X-Forwarded-For so FastAPI can key rate limits on the real client IP', async () => {
    // Cloud Run stamps XFF on the request to the Next container; FastAPI's
    // _client_ip takes the first entry. Dropping it here would collapse every
    // login/signup attempt onto the Next egress IP. See PR #245 review.
    await POST(
      buildRequest('http://localhost:3000/v1/auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
        body: '{}',
      }),
      context(['auth', 'login'])
    );

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    });
  });

  it('handles HEAD (forwards the method, sends no body)', async () => {
    await HEAD(
      buildRequest('http://localhost:3000/v1/posts', { method: 'HEAD' }),
      context(['posts'])
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('drops hop-by-hop headers', async () => {
    await GET(
      buildRequest('http://localhost:3000/v1/posts', {
        headers: { connection: 'keep-alive' },
      }),
      context(['posts'])
    );

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      'connection'
    );
  });

  it('forwards a POST body', async () => {
    await POST(
      buildRequest('http://localhost:3000/v1/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Soup' }),
      }),
      context(['posts'])
    );

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(Buffer.from(init.body).toString('utf8')).toBe('{"title":"Soup"}');
  });

  it('sends no body for GET', async () => {
    await GET(
      buildRequest('http://localhost:3000/v1/posts'),
      context(['posts'])
    );

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('relays the upstream status and body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), {
        status: 404,
      })
    );

    const response = await GET(
      buildRequest('http://localhost:3000/v1/posts/nope'),
      context(['posts', 'nope'])
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('re-emits every upstream Set-Cookie header separately', async () => {
    const upstream = new Response('{}', { status: 200 });
    upstream.headers.append('Set-Cookie', 'refresh_token=a; Path=/; HttpOnly');
    upstream.headers.append('Set-Cookie', 'csrf_token=b; Path=/');
    fetchMock.mockResolvedValue(upstream);

    const response = await DELETE(
      buildRequest('http://localhost:3000/v1/auth/x', { method: 'DELETE' }),
      context(['auth', 'x'])
    );

    expect(response.headers.getSetCookie()).toEqual([
      'refresh_token=a; Path=/; HttpOnly',
      'csrf_token=b; Path=/',
    ]);
  });

  it('returns 500 when the upstream URL is not configured', async () => {
    delete process.env.API_INTERNAL_URL;
    const originalPublic = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    const response = await GET(
      buildRequest('http://localhost:3000/v1/posts'),
      context(['posts'])
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();

    if (originalPublic !== undefined) {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublic;
    }
  });

  it('rejects with 413 when Content-Length exceeds the cap, without calling upstream', async () => {
    const oversized = String(51 * 1024 * 1024);
    const response = await POST(
      buildRequest('http://localhost:3000/v1/posts', {
        method: 'POST',
        headers: { 'content-length': oversized },
        body: 'x',
      }),
      context(['posts'])
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a normally-sized body read through the bounded reader', async () => {
    // 6MB — comfortably under the 50MB cap. Proves readBoundedBody assembles
    // the streamed chunks correctly and does not false-positive on a
    // legitimately-sized multipart upload.
    const payload = new Uint8Array(6 * 1024 * 1024).fill(97);
    const request = new NextRequest('http://localhost:3000/v1/posts', {
      method: 'POST',
      body: payload,
      // `duplex: 'half'` is mandatory when constructing a Request with a stream
      // body under undici, but isn't in NextRequest's RequestInit typings.
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1]);

    const response = await POST(request, context(['posts']));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body.byteLength).toBe(6 * 1024 * 1024);
  });

  it('returns 502 when the upstream call throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await GET(
      buildRequest('http://localhost:3000/v1/posts'),
      context(['posts'])
    );

    expect(response.status).toBe(502);
  });
});
