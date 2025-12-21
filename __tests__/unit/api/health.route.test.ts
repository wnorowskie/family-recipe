import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { masterKeyEnvPresent } from '@/lib/masterKey';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    familySpace: {
      count: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('@/lib/masterKey', () => ({
  masterKeyEnvPresent: jest.fn(),
}));

const mockQueryRaw = prisma.$queryRaw as jest.MockedFunction<
  typeof prisma.$queryRaw
>;
const mockFamilySpaceCount = prisma.familySpace.count as jest.MockedFunction<
  typeof prisma.familySpace.count
>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;
const mockMasterKeyEnvPresent = masterKeyEnvPresent as jest.MockedFunction<
  typeof masterKeyEnvPresent
>;

describe('/api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 when DB is reachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockFamilySpaceCount.mockResolvedValueOnce(1);
    mockMasterKeyEnvPresent.mockReturnValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.ok).toBe(true);
    expect(body.db).toEqual({ ok: true });
    expect(body.masterKey).toEqual({ ok: true, familySpaceExists: true });
    expect(typeof body.latencyMs).toBe('number');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('returns 503 when DB is unreachable', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db down'));
    mockFamilySpaceCount.mockResolvedValueOnce(1);
    mockMasterKeyEnvPresent.mockReturnValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.ok).toBe(false);
    expect(body.db).toEqual({ ok: false });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
