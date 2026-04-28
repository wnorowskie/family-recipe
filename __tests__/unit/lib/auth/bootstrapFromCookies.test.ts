import {
  bootstrapAccessToken,
  fetchSessionUser,
} from '@/lib/auth/bootstrapFromCookies';

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

describe('bootstrapFromCookies helpers', () => {
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

  describe('fetchSessionUser (non-rotating SSR path)', () => {
    it('returns CONFIG when NEXT_PUBLIC_API_BASE_URL is unset', async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'CONFIG' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns MISSING_COOKIES when no cookie header', async () => {
      const result = await fetchSessionUser(null);

      expect(result).toEqual({ ok: false, reason: 'MISSING_COOKIES' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns MISSING_COOKIES when csrf_token cookie is absent', async () => {
      const result = await fetchSessionUser('refresh_token=opaque');

      expect(result).toEqual({ ok: false, reason: 'MISSING_COOKIES' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('hits /v1/auth/session with cookies and CSRF header', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ user: fixtureUser }));

      const result = await fetchSessionUser(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: true, user: fixtureUser });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://api.local/v1/auth/session');
      expect(init.method).toBe('GET');
      expect(init.headers.Cookie).toBe(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );
      expect(init.headers['X-CSRF-Token']).toBe('csrf-abc');
    });

    it('returns SESSION_FAILED on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'no' }), { status: 401 })
      );

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'SESSION_FAILED' });
    });

    it('returns SESSION_INVALID on malformed body (no user field)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }));

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'SESSION_INVALID' });
    });

    it('returns SESSION_INVALID when user object lacks required fields', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ user: {} }));

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'SESSION_INVALID' });
    });

    it('returns SESSION_INVALID when user.id is missing or non-string', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          user: {
            name: 'X',
            email: 'x@y',
            username: 'x',
            role: 'member',
            familySpaceId: 'f',
          },
        })
      );

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'SESSION_INVALID' });
    });

    it('returns NETWORK on fetch error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('connection refused'));

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result).toEqual({ ok: false, reason: 'NETWORK' });
    });

    it('does not propagate Set-Cookie (non-rotating: nothing to forward)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ user: fixtureUser }), {
          status: 200,
          headers: [
            ['content-type', 'application/json'],
            ['set-cookie', 'evil=should-not-leak'],
          ],
        })
      );

      const result = await fetchSessionUser('refresh_token=x; csrf_token=y');

      expect(result.ok).toBe(true);
      // The success type does not include setCookies — the contract enforces
      // non-propagation at the type level.
      if (result.ok) {
        expect(result).not.toHaveProperty('setCookies');
      }
    });
  });

  describe('bootstrapAccessToken (rotating, route-handler-only)', () => {
    it('chains /v1/auth/refresh then /v1/auth/me', async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: 'new-token' }), {
            status: 200,
            headers: [
              ['content-type', 'application/json'],
              ['set-cookie', 'refresh_token=rotated; Path=/; HttpOnly'],
              ['set-cookie', 'csrf_token=rotated-csrf; Path=/'],
            ],
          })
        )
        .mockResolvedValueOnce(jsonResponse({ user: fixtureUser }));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({
        ok: true,
        accessToken: 'new-token',
        user: fixtureUser,
        setCookies: [
          'refresh_token=rotated; Path=/; HttpOnly',
          'csrf_token=rotated-csrf; Path=/',
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://api.local/v1/auth/refresh'
      );
      expect(fetchMock.mock.calls[1][0]).toBe('http://api.local/v1/auth/me');
      // /me uses the freshly-minted bearer.
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        'Bearer new-token'
      );
    });

    it('returns REFRESH_FAILED when refresh non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'reuse' }), { status: 401 })
      );

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'REFRESH_FAILED' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns REFRESH_INVALID on malformed refresh body', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'REFRESH_INVALID' });
    });

    it('returns ME_FAILED when /me 401s', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'no' }), { status: 401 })
        );

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'ME_FAILED' });
    });

    it('returns ME_INVALID when /me body lacks user', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'ME_INVALID' });
    });

    it('returns ME_INVALID when user object lacks required fields', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ user: {} }));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'ME_INVALID' });
    });

    it('returns NETWORK on refresh fetch error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('connection refused'));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'NETWORK' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns NETWORK on /me fetch error', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'tok' }))
        .mockRejectedValueOnce(new Error('connection refused'));

      const result = await bootstrapAccessToken(
        'refresh_token=opaque; csrf_token=csrf-abc'
      );

      expect(result).toEqual({ ok: false, reason: 'NETWORK' });
    });

    it('returns CONFIG when base URL unset', async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;

      const result = await bootstrapAccessToken(
        'refresh_token=x; csrf_token=y'
      );

      expect(result).toEqual({ ok: false, reason: 'CONFIG' });
    });
  });
});
