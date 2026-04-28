import {
  apiClient,
  ApiError,
  setAccessTokenProvider,
  clearAccessTokenProvider,
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
});
