import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
}));

const mockQueryRaw = prisma.$queryRaw as jest.MockedFunction<
  typeof prisma.$queryRaw
>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;

describe('/api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 when DB is reachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.ok).toBe(true);
    expect(body.db).toEqual({ ok: true });
    expect(typeof body.latencyMs).toBe('number');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('returns 503 when DB is unreachable', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db down'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.ok).toBe(false);
    expect(body.db).toEqual({ ok: false });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
