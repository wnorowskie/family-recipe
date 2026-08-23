import {
  apiClient,
  ApiError,
  clearAccessTokenProvider,
  clearRefreshHooks,
  setAccessTokenProvider,
  setRefreshHooks,
  tryRefresh,
} from '@/lib/apiClient';
import { API_ERROR_CODES } from '@/lib/apiErrors';

const originalFetch = global.fetch;
const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('apiClient', () => {
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    clearAccessTokenProvider();
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    }
    clearAccessTokenProvider();
    clearRefreshHooks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('base URL', () => {
    it('issues same-origin requests when NEXT_PUBLIC_API_BASE_URL is unset', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timeline',
        expect.any(Object)
      );
    });

    it('prefixes the base URL when set', async () => {
      process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000';
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/timeline',
        expect.any(Object)
      );
    });

    it('strips a trailing slash from the base URL', async () => {
      process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000/';
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/timeline',
        expect.any(Object)
      );
    });
  });

  describe('query params', () => {
    it('serializes the query option onto the URL', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline', {
        query: { limit: 20, offset: 40, search: undefined },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/timeline?limit=20&offset=40',
        expect.any(Object)
      );
    });
  });

  describe('headers and bodies', () => {
    it('sets Content-Type: application/json and stringifies object bodies', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.post('/api/posts', { body: { title: 'hi' } });

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(init.body).toBe('{"title":"hi"}');
    });

    it('does not set Content-Type for FormData bodies (lets fetch set the boundary)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
      const fd = new FormData();
      fd.append('payload', '{}');

      await apiClient.post('/api/posts', { body: fd });

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
      expect(init.body).toBe(fd);
    });

    it('always sets Accept: application/json', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Accept).toBe('application/json');
    });

    it('defaults credentials to "include" so the session cookie travels with the request', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.credentials).toBe('include');
    });
  });

  describe('access token injection', () => {
    it('omits the Authorization header when no provider is registered', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it('omits the Authorization header when the provider returns null', async () => {
      setAccessTokenProvider(() => null);
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it('attaches Bearer <token> when the provider returns a token', async () => {
      setAccessTokenProvider(() => 'access-token-xyz');
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-token-xyz');
    });
  });

  describe('error normalization', () => {
    const cases: Array<{
      status: number;
      code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
    }> = [
      { status: 400, code: API_ERROR_CODES.VALIDATION_ERROR },
      { status: 401, code: API_ERROR_CODES.UNAUTHORIZED },
      { status: 403, code: API_ERROR_CODES.FORBIDDEN },
      { status: 404, code: API_ERROR_CODES.NOT_FOUND },
      { status: 409, code: API_ERROR_CODES.CONFLICT },
      { status: 429, code: API_ERROR_CODES.RATE_LIMIT_EXCEEDED },
      { status: 500, code: API_ERROR_CODES.INTERNAL_ERROR },
    ];

    it.each(cases)(
      'maps status $status to ApiError with code $code when the body is not structured',
      async ({ status, code }) => {
        fetchMock.mockResolvedValue(new Response('plain text', { status }));

        await expect(apiClient.get('/api/anything')).rejects.toMatchObject({
          name: 'ApiError',
          code,
          status,
        });
      }
    );

    it('passes through { error: { code, message } } from the backend when code is recognized', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: API_ERROR_CODES.VALIDATION_ERROR,
              message: 'title is required',
            },
          },
          { status: 400 }
        )
      );

      try {
        await apiClient.post('/api/posts', { body: {} });
        fail('expected ApiError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        expect((err as ApiError).message).toBe('title is required');
        expect((err as ApiError).status).toBe(400);
      }
    });

    it('falls back to the status-based code if the body code is unknown', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { error: { code: 'NOT_A_REAL_CODE', message: 'oops' } },
          { status: 403 }
        )
      );

      try {
        await apiClient.get('/api/forbidden');
        fail('expected ApiError');
      } catch (err) {
        expect((err as ApiError).code).toBe(API_ERROR_CODES.FORBIDDEN);
        expect((err as ApiError).message).toBe('oops');
      }
    });
  });

  describe('successful responses', () => {
    it('returns parsed JSON for 2xx with application/json', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ items: [1, 2] }));

      const data = await apiClient.get<{ items: number[] }>('/api/timeline');

      expect(data).toEqual({ items: [1, 2] });
    });

    it('returns undefined for 204 No Content', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      const data = await apiClient.del('/api/posts/1');

      expect(data).toBeUndefined();
    });
  });

  describe('refresh-and-retry on 401', () => {
    const originalDocument = (global as { document?: unknown }).document;

    function setCookie(value: string): void {
      Object.defineProperty(global, 'document', {
        value: { cookie: value },
        configurable: true,
        writable: true,
      });
    }

    afterEach(() => {
      if (originalDocument === undefined) {
        delete (global as { document?: unknown }).document;
      } else {
        Object.defineProperty(global, 'document', {
          value: originalDocument,
          configurable: true,
          writable: true,
        });
      }
    });

    it('attempts a single refresh on 401 and retries the original request', async () => {
      setCookie('csrf_token=csrf-abc');
      const onRefreshed = jest.fn();
      const onRefreshFailed = jest.fn();
      setRefreshHooks({ onRefreshed, onRefreshFailed });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        )
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token' }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const data = await apiClient.get<{ ok: boolean }>('/api/timeline');

      expect(data).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/bootstrap');
      expect(fetchMock.mock.calls[1][1]?.headers).toEqual(
        expect.objectContaining({ 'X-CSRF-Token': 'csrf-abc' })
      );
      expect(onRefreshed).toHaveBeenCalledWith('new-token', undefined);
      expect(onRefreshFailed).not.toHaveBeenCalled();
    });

    it('throws the original 401 and calls onRefreshFailed when refresh returns non-2xx', async () => {
      setCookie('csrf_token=csrf-abc');
      const onRefreshed = jest.fn();
      const onRefreshFailed = jest.fn();
      setRefreshHooks({ onRefreshed, onRefreshFailed });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        );

      await expect(apiClient.get('/api/timeline')).rejects.toMatchObject({
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    });

    it('does not loop when the retried request also returns 401', async () => {
      setCookie('csrf_token=csrf-abc');
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        )
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token' }))
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        );

      await expect(apiClient.get('/api/timeline')).rejects.toMatchObject({
        status: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('dedups concurrent 401s into a single refresh call', async () => {
      setCookie('csrf_token=csrf-abc');
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock.mockImplementation((url: string) => {
        if (url === '/api/auth/bootstrap') {
          return Promise.resolve(jsonResponse({ accessToken: 'new-token' }));
        }
        // Each non-refresh URL: first call 401, second call 200.
        const callsForUrl = fetchMock.mock.calls.filter(
          ([u]) => u === url
        ).length;
        if (callsForUrl === 1) {
          return Promise.resolve(
            jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
          );
        }
        return Promise.resolve(jsonResponse({ url }));
      });

      const [a, b] = await Promise.all([
        apiClient.get<{ url: string }>('/api/a'),
        apiClient.get<{ url: string }>('/api/b'),
      ]);

      expect(a).toEqual({ url: '/api/a' });
      expect(b).toEqual({ url: '/api/b' });
      const refreshCalls = fetchMock.mock.calls.filter(
        ([url]) => url === '/api/auth/bootstrap'
      );
      expect(refreshCalls).toHaveLength(1);
    });

    it('does not attempt refresh when the failing request is /api/auth/bootstrap itself', async () => {
      setCookie('csrf_token=csrf-abc');
      const onRefreshed = jest.fn();
      const onRefreshFailed = jest.fn();
      setRefreshHooks({ onRefreshed, onRefreshFailed });

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      );

      await expect(apiClient.post('/api/auth/bootstrap')).rejects.toMatchObject(
        {
          status: 401,
        }
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(onRefreshFailed).not.toHaveBeenCalled();
    });

    it('does not attempt refresh when the failing request is /v1/auth/login', async () => {
      setCookie('csrf_token=csrf-abc');
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      );

      await expect(
        apiClient.post('/v1/auth/login', {
          body: { emailOrUsername: 'x', password: 'y' },
        })
      ).rejects.toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not attempt refresh on 429 (rate limit)', async () => {
      setCookie('csrf_token=csrf-abc');
      const onRefreshed = jest.fn();
      const onRefreshFailed = jest.fn();
      setRefreshHooks({ onRefreshed, onRefreshFailed });

      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'RATE_LIMIT_EXCEEDED' } },
          { status: 429 }
        )
      );

      await expect(apiClient.get('/api/timeline')).rejects.toMatchObject({
        status: 429,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(onRefreshFailed).not.toHaveBeenCalled();
    });

    it('does not attempt refresh when no hooks are registered', async () => {
      setCookie('csrf_token=csrf-abc');

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
      );

      await expect(apiClient.get('/api/timeline')).rejects.toMatchObject({
        status: 401,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('omits the X-CSRF-Token header when the cookie is absent', async () => {
      setCookie('');
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        )
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token' }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      await apiClient.get('/api/timeline');

      const refreshHeaders = fetchMock.mock.calls[1][1]?.headers as Record<
        string,
        string
      >;
      expect(refreshHeaders).not.toHaveProperty('X-CSRF-Token');
    });

    it('treats a malformed refresh response (no accessToken) as a failure', async () => {
      setCookie('csrf_token=csrf-abc');
      const onRefreshed = jest.fn();
      const onRefreshFailed = jest.fn();
      setRefreshHooks({ onRefreshed, onRefreshFailed });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
        )
        .mockResolvedValueOnce(jsonResponse({ wrongField: 'oops' }));

      await expect(apiClient.get('/api/timeline')).rejects.toMatchObject({
        status: 401,
      });
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    });
  });

  // #276: AuthBootstrap starts a rotating refresh on mount. A request made in
  // that window used to go out with no Authorization header, 401, and recover
  // only on the retry — which a concurrent navigation could abort, silently
  // dropping the write.
  describe('joining an in-flight refresh', () => {
    const originalDocument = (global as { document?: unknown }).document;

    function setCookie(value: string): void {
      Object.defineProperty(global, 'document', {
        value: { cookie: value },
        configurable: true,
        writable: true,
      });
    }

    // Resolves once every pending microtask *and* macrotask has drained, so an
    // assertion of "this fetch has not been issued" is meaningful rather than
    // just early.
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    // apiClient's `inflightRefresh` is module state with no exported reset. A
    // test that fails before releasing its deferred refresh would otherwise
    // leave it pending forever, and the next test's tryRefresh() would join
    // that dead promise instead of issuing its own fetch. Track every deferred
    // response and settle them all in afterEach so a failure stays local.
    let releases: Array<() => void> = [];

    function deferredRefresh(): Promise<Response> {
      let release: (value: Response) => void = () => {};
      const promise = new Promise<Response>((resolve) => {
        release = resolve;
      });
      releases.push(() => release(jsonResponse({ accessToken: 'released' })));
      return promise;
    }

    beforeEach(() => {
      setCookie('csrf_token=csrf-abc');
      releases = [];
    });

    afterEach(async () => {
      for (const release of releases) release();
      await flush();
      if (originalDocument === undefined) {
        delete (global as { document?: unknown }).document;
      } else {
        Object.defineProperty(global, 'document', {
          value: originalDocument,
          configurable: true,
          writable: true,
        });
      }
    });

    it('holds a tokenless request until the in-flight refresh resolves, then sends it authenticated', async () => {
      let token: string | null = null;
      setAccessTokenProvider(() => token);
      setRefreshHooks({
        onRefreshed: (accessToken) => {
          token = accessToken;
        },
        onRefreshFailed: () => {
          token = null;
        },
      });

      let releaseRefresh: (value: Response) => void = () => {};
      const pendingRefresh = new Promise<Response>((resolve) => {
        releaseRefresh = resolve;
      });
      releases.push(() => releaseRefresh(jsonResponse({ accessToken: 'x' })));

      fetchMock
        .mockReturnValueOnce(pendingRefresh)
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      const refreshing = tryRefresh();
      const writing = apiClient.post<{ ok: boolean }>('/v1/posts/p1/comments', {
        body: { text: 'hello' },
      });

      await flush();
      // Only the bootstrap has gone out — the write is parked, not 401ing.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/bootstrap');

      releaseRefresh(jsonResponse({ accessToken: 'fresh-token' }));
      await expect(refreshing).resolves.toBe(true);
      await expect(writing).resolves.toEqual({ ok: true });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('/v1/posts/p1/comments');
      expect(fetchMock.mock.calls[1][1]?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer fresh-token' })
      );
    });

    it('does not wait when a token is already held, even mid-rotation', async () => {
      setAccessTokenProvider(() => 'existing-token');
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock
        .mockReturnValueOnce(deferredRefresh())
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      void tryRefresh();
      await expect(
        apiClient.get<{ ok: boolean }>('/v1/posts')
      ).resolves.toEqual({ ok: true });

      expect(fetchMock.mock.calls[1][1]?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer existing-token' })
      );
    });

    it('does not park auth endpoints behind an in-flight refresh', async () => {
      setAccessTokenProvider(() => null);
      setRefreshHooks({ onRefreshed: jest.fn(), onRefreshFailed: jest.fn() });

      fetchMock
        .mockReturnValueOnce(deferredRefresh())
        .mockResolvedValueOnce(jsonResponse({ ok: true }));

      void tryRefresh();
      // Would hang here if logout were parked behind the pending refresh.
      await expect(apiClient.post('/api/auth/logout')).resolves.toEqual({
        ok: true,
      });
    });
  });
});
