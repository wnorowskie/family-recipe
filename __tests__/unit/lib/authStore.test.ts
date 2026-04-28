import {
  type AuthUser,
  clearSession,
  getAccessToken,
  getSnapshot,
  getUser,
  setSession,
  subscribe,
} from '@/lib/authStore';

const fixtureUser: AuthUser = {
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

describe('authStore', () => {
  afterEach(() => {
    clearSession();
  });

  it('starts empty', () => {
    expect(getAccessToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it('setSession stores token and user', () => {
    setSession('token-abc', fixtureUser);
    expect(getAccessToken()).toBe('token-abc');
    expect(getUser()).toEqual(fixtureUser);
  });

  it('clearSession resets state', () => {
    setSession('token-abc', fixtureUser);
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it('subscribe fires on setSession', () => {
    const listener = jest.fn();
    subscribe(listener);
    setSession('token-abc', fixtureUser);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe fires on clearSession when state changes', () => {
    setSession('token-abc', fixtureUser);
    const listener = jest.fn();
    subscribe(listener);
    clearSession();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe does not fire when setSession is a no-op', () => {
    setSession('token-abc', fixtureUser);
    const listener = jest.fn();
    subscribe(listener);
    setSession('token-abc', fixtureUser);
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe does not fire when clearSession is a no-op', () => {
    const listener = jest.fn();
    subscribe(listener);
    clearSession();
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    setSession('token-abc', fixtureUser);
    unsubscribe();
    clearSession();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getSnapshot returns a stable reference when state is unchanged', () => {
    const a = getSnapshot();
    const b = getSnapshot();
    expect(a).toBe(b);
  });

  it('getSnapshot returns a new reference after a state change', () => {
    const before = getSnapshot();
    setSession('token-abc', fixtureUser);
    const after = getSnapshot();
    expect(after).not.toBe(before);
  });

  it('refresh hook updates only the access token, preserving the user', async () => {
    setSession('old-token', fixtureUser);
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === '/v1/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'rotated-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      // First call to /api/foo returns 401, retried call returns 200.
      const callsForUrl = fetchMock.mock.calls.filter(
        ([u]: [string]) => u === url
      ).length;
      if (callsForUrl === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    });
    const originalFetch = global.fetch;
    const originalDocument = (global as { document?: unknown }).document;
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(global, 'document', {
      value: { cookie: 'csrf_token=csrf-xyz' },
      configurable: true,
      writable: true,
    });
    try {
      const { apiClient } = await import('@/lib/apiClient');
      await apiClient.get('/api/foo');
      expect(getAccessToken()).toBe('rotated-token');
      expect(getUser()).toEqual(fixtureUser);
    } finally {
      global.fetch = originalFetch;
      if (originalDocument === undefined) {
        delete (global as { document?: unknown }).document;
      } else {
        Object.defineProperty(global, 'document', {
          value: originalDocument,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  it('refresh failure clears the session', async () => {
    setSession('old-token', fixtureUser);
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === '/v1/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );
    });
    const originalFetch = global.fetch;
    const originalDocument = (global as { document?: unknown }).document;
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(global, 'document', {
      value: { cookie: 'csrf_token=csrf-xyz' },
      configurable: true,
      writable: true,
    });
    try {
      const { apiClient } = await import('@/lib/apiClient');
      await expect(apiClient.get('/api/foo')).rejects.toMatchObject({
        status: 401,
      });
      expect(getAccessToken()).toBeNull();
      expect(getUser()).toBeNull();
    } finally {
      global.fetch = originalFetch;
      if (originalDocument === undefined) {
        delete (global as { document?: unknown }).document;
      } else {
        Object.defineProperty(global, 'document', {
          value: originalDocument,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  it('wires the apiClient access-token provider on import', async () => {
    setSession('token-from-store', fixtureUser);
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { apiClient } = await import('@/lib/apiClient');
      await apiClient.get('/whatever');
      expect(fetchMock).toHaveBeenCalledWith(
        '/whatever',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-from-store',
          }),
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
