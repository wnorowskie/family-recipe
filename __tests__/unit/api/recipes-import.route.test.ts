import { NextRequest } from 'next/server';

import { POST } from '@/app/api/recipes/import/route';

jest.mock('@/lib/session', () => ({
  getCurrentUser: jest
    .fn()
    .mockResolvedValue({
      id: 'user-1',
      familySpaceId: 'fam-1',
      role: 'member',
    }),
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
}));

describe('/api/recipes/import', () => {
  const importerResponse = {
    request_id: 'abc',
    recipe: {
      title: 'Test Recipe',
      ingredients: ['1 cup rice'],
      steps: ['Cook rice'],
      servings: '2',
      total_time_minutes: 30,
      image_url: null,
      author: null,
      source: { domain: 'example.com', url: 'https://example.com' },
    },
    confidence: 0.9,
    warnings: [],
    missing_fields: [],
  };

  beforeEach(() => {
    process.env.RECIPE_IMPORTER_URL = 'https://importer.dev';
    process.env.RECIPE_IMPORTER_STATIC_TOKEN = 'token';
    process.env.RECIPE_IMPORTER_SERVICE_ACCOUNT_EMAIL = 'service@example.com';
    (global.fetch as unknown as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => importerResponse,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.RECIPE_IMPORTER_URL;
    delete process.env.RECIPE_IMPORTER_STATIC_TOKEN;
    delete process.env.RECIPE_IMPORTER_SERVICE_ACCOUNT_EMAIL;
  });

  it('returns importer payload on success', async () => {
    const req = new NextRequest(
      new Request('http://localhost/api/recipes/import', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/recipe' }),
      })
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recipe.title).toBe('Test Recipe');
    expect(fetch).toHaveBeenCalledWith(
      'https://importer.dev/v1/parse',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('returns error status when importer fails', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({ message: 'Upstream failed' }),
    });

    const req = new NextRequest(
      new Request('http://localhost/api/recipes/import', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/recipe' }),
      })
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.message).toContain('Upstream failed');
  });
});
