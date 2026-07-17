import {
  clearIdentityTokenCache,
  fetchUpstream,
  getUpstreamOrigin,
  UpstreamNotConfiguredError,
} from '@/lib/apiUpstream';

const ENV_KEYS = [
  'API_INTERNAL_URL',
  'API_INTERNAL_AUDIENCE',
  'API_INTERNAL_SERVICE_ACCOUNT_EMAIL',
  'API_INTERNAL_STATIC_TOKEN',
  'NEXT_PUBLIC_API_BASE_URL',
  'K_SERVICE',
] as const;

// Builds a JWT-shaped token whose payload carries `exp`, so the cache-expiry
// decode path in getIdentityToken has something real to parse.
function buildIdToken(expSecondsFromNow: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })
  ).toString('base64url');
  return `header.${payload}.signature`;
}

describe('lib/apiUpstream', () => {
  const originalFetch = global.fetch;
  const originalEnv: Record<string, string | undefined> = {};
  let fetchMock: jest.Mock;

  beforeAll(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    clearIdentityTokenCache();
    fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('getUpstreamOrigin', () => {
    it('returns null when neither env var is set', () => {
      expect(getUpstreamOrigin()).toBeNull();
    });

    it('prefers API_INTERNAL_URL over the public base URL', () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example';
      expect(getUpstreamOrigin()).toBe('https://api.internal');
    });

    it('falls back to NEXT_PUBLIC_API_BASE_URL for local dev', () => {
      process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000';
      expect(getUpstreamOrigin()).toBe('http://localhost:8000');
    });

    it('strips a trailing slash', () => {
      process.env.API_INTERNAL_URL = 'https://api.internal/';
      expect(getUpstreamOrigin()).toBe('https://api.internal');
    });
  });

  describe('fetchUpstream', () => {
    it('throws UpstreamNotConfiguredError when no origin is configured', async () => {
      await expect(fetchUpstream('/v1/posts')).rejects.toBeInstanceOf(
        UpstreamNotConfiguredError
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requests origin + path', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';

      await fetchUpstream('/v1/posts?limit=2');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.internal/v1/posts?limit=2'
      );
    });

    it('omits the IAM header when there is no audience (local dev)', async () => {
      process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8000';

      await fetchUpstream('/v1/posts');

      const init = fetchMock.mock.calls[0][1];
      expect(init.headers['X-Serverless-Authorization']).toBeUndefined();
      // Only the upstream call — no metadata-server round trip.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('attaches the ID token via X-Serverless-Authorization, leaving Authorization intact', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_AUDIENCE = 'https://api.internal';
      const idToken = buildIdToken(3600);
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith('http://metadata.google.internal')
            ? new Response(idToken, { status: 200 })
            : new Response('{}', { status: 200 })
        )
      );

      await fetchUpstream('/v1/posts', {
        headers: { Authorization: 'Bearer user-access-token' },
      });

      const upstreamCall = fetchMock.mock.calls.find(
        ([url]: [string]) => !url.startsWith('http://metadata.google.internal')
      );
      expect(upstreamCall[1].headers).toMatchObject({
        // The end user's FastAPI token must survive untouched — Cloud Run
        // checks X-Serverless-Authorization instead when both are present.
        Authorization: 'Bearer user-access-token',
        'X-Serverless-Authorization': `Bearer ${idToken}`,
      });
    });

    it('mints the ID token once and reuses it while unexpired', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_AUDIENCE = 'https://api.internal';
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith('http://metadata.google.internal')
            ? new Response(buildIdToken(3600), { status: 200 })
            : new Response('{}', { status: 200 })
        )
      );

      await fetchUpstream('/v1/posts');
      await fetchUpstream('/v1/timeline');

      const metadataCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
        url.startsWith('http://metadata.google.internal')
      );
      expect(metadataCalls).toHaveLength(1);
    });

    it('re-mints when the cached token is within the expiry skew', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_AUDIENCE = 'https://api.internal';
      // 60s of life is inside the 300s skew, so the cache must not serve it.
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith('http://metadata.google.internal')
            ? new Response(buildIdToken(60), { status: 200 })
            : new Response('{}', { status: 200 })
        )
      );

      await fetchUpstream('/v1/posts');
      await fetchUpstream('/v1/timeline');

      const metadataCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
        url.startsWith('http://metadata.google.internal')
      );
      expect(metadataCalls).toHaveLength(2);
    });

    it('uses API_INTERNAL_STATIC_TOKEN without touching the metadata server', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_STATIC_TOKEN = 'static-token';

      await fetchUpstream('/v1/posts');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
        'X-Serverless-Authorization': 'Bearer static-token',
      });
    });

    it('propagates a metadata-server failure rather than sending an unauthenticated request', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_AUDIENCE = 'https://api.internal';
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith('http://metadata.google.internal')
            ? new Response('nope', { status: 500, statusText: 'Server Error' })
            : new Response('{}', { status: 200 })
        )
      );

      await expect(fetchUpstream('/v1/posts')).rejects.toThrow(
        /Failed to obtain identity token/
      );
      const upstreamCalls = fetchMock.mock.calls.filter(
        ([url]: [string]) => !url.startsWith('http://metadata.google.internal')
      );
      expect(upstreamCalls).toHaveLength(0);
    });

    it('requests the identity token for the configured audience and service account', async () => {
      process.env.API_INTERNAL_URL = 'https://api.internal';
      process.env.API_INTERNAL_AUDIENCE = 'https://aud.example';
      process.env.API_INTERNAL_SERVICE_ACCOUNT_EMAIL = 'runner@proj.iam';
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          url.startsWith('http://metadata.google.internal')
            ? new Response(buildIdToken(3600), { status: 200 })
            : new Response('{}', { status: 200 })
        )
      );

      await fetchUpstream('/v1/posts');

      const [metadataUrl, metadataInit] = fetchMock.mock.calls[0];
      expect(metadataUrl).toBe(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/' +
          'runner@proj.iam/identity?audience=https%3A%2F%2Faud.example'
      );
      expect(metadataInit.headers).toMatchObject({
        'Metadata-Flavor': 'Google',
      });
    });
  });
});
