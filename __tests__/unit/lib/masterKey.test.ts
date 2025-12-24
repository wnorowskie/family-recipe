import bcrypt from 'bcrypt';
import { logInfo } from '@/lib/logger';
import {
  prismaMock,
  resetPrismaMock,
} from '../../integration/helpers/mock-prisma';

type MasterKeyModule = typeof import('@/lib/masterKey');

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/lib/logger', () => ({
  logInfo: jest.fn(),
}));

const ORIGINAL_ENV = { ...process.env };
const bcryptHashMock = bcrypt.hash as unknown as jest.Mock;
const logInfoMock = logInfo as jest.MockedFunction<typeof logInfo>;

const loadMasterKeyModule = (): MasterKeyModule => {
  let loadedModule: MasterKeyModule;
  jest.isolateModules(() => {
    loadedModule = require('@/lib/masterKey');
  });
  return loadedModule!;
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.FAMILY_MASTER_KEY_HASH;
  delete process.env.FAMILY_MASTER_KEY;
  delete process.env.FAMILY_NAME;
  bcryptHashMock.mockReset();
  logInfoMock.mockReset();
  resetPrismaMock();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('getEnvMasterKeyHash', () => {
  it('returns cached env hash without hashing when FAMILY_MASTER_KEY_HASH is provided', async () => {
    process.env.FAMILY_MASTER_KEY_HASH = '  hashed-value  ';
    const { getEnvMasterKeyHash } = loadMasterKeyModule();

    const first = await getEnvMasterKeyHash();
    const second = await getEnvMasterKeyHash();

    expect(first).toBe('hashed-value');
    expect(second).toBe('hashed-value');
    expect(bcryptHashMock).not.toHaveBeenCalled();
  });

  it('hashes FAMILY_MASTER_KEY when only plain text key is provided and caches the result', async () => {
    process.env.FAMILY_MASTER_KEY = '  secret-key  ';
    const { getEnvMasterKeyHash } = loadMasterKeyModule();

    bcryptHashMock.mockResolvedValue('hashed-secret');

    const first = await getEnvMasterKeyHash();
    const second = await getEnvMasterKeyHash();

    expect(first).toBe('hashed-secret');
    expect(second).toBe('hashed-secret');
    expect(bcryptHashMock).toHaveBeenCalledTimes(1);
    expect(bcryptHashMock).toHaveBeenCalledWith('secret-key', 12);
  });

  it('throws when neither FAMILY_MASTER_KEY_HASH nor FAMILY_MASTER_KEY are set', async () => {
    const { getEnvMasterKeyHash } = loadMasterKeyModule();

    await expect(getEnvMasterKeyHash()).rejects.toThrow(
      'FAMILY_MASTER_KEY is not set'
    );
  });
});

describe('ensureFamilySpace', () => {
  it('returns existing family space when hash already matches', async () => {
    const { ensureFamilySpace } = loadMasterKeyModule();
    const existing = {
      id: 'space_1',
      name: 'Family',
      masterKeyHash: 'current-hash',
    } as any;
    prismaMock.familySpace.findFirst.mockResolvedValue(existing);

    const result = await ensureFamilySpace('current-hash');

    expect(result).toBe(existing);
    expect(prismaMock.familySpace.update).not.toHaveBeenCalled();
    expect(logInfoMock).not.toHaveBeenCalled();
  });

  it('updates stored hash and logs when existing hash differs', async () => {
    const { ensureFamilySpace } = loadMasterKeyModule();
    const existing = {
      id: 'space_1',
      name: 'Family',
      masterKeyHash: 'old-hash',
    } as any;
    prismaMock.familySpace.findFirst.mockResolvedValue(existing);

    const result = await ensureFamilySpace('new-hash');

    expect(prismaMock.familySpace.update).toHaveBeenCalledWith({
      where: { id: 'space_1' },
      data: { masterKeyHash: 'new-hash' },
    });
    expect(logInfoMock).toHaveBeenCalledWith('family.master_key.synced', {
      familySpaceId: 'space_1',
    });
    expect(result).toEqual({ ...existing, masterKeyHash: 'new-hash' });
  });

  it('creates a new family space using FAMILY_NAME when none exists', async () => {
    const { ensureFamilySpace } = loadMasterKeyModule();
    prismaMock.familySpace.findFirst.mockResolvedValue(null as any);
    prismaMock.familySpace.create.mockResolvedValue({
      id: 'space_created',
      name: 'Norowski Fam',
      masterKeyHash: 'env-hash',
    } as any);
    process.env.FAMILY_NAME = '  Norowski Fam  ';

    const result = await ensureFamilySpace('env-hash');

    expect(prismaMock.familySpace.create).toHaveBeenCalledWith({
      data: {
        name: 'Norowski Fam',
        masterKeyHash: 'env-hash',
      },
    });
    expect(logInfoMock).toHaveBeenCalledWith('family.created_from_env', {
      familySpaceId: 'space_created',
      familyName: 'Norowski Fam',
    });
    expect(result).toEqual({
      id: 'space_created',
      name: 'Norowski Fam',
      masterKeyHash: 'env-hash',
    });
  });

  it('defaults family name when FAMILY_NAME is missing', async () => {
    const { ensureFamilySpace } = loadMasterKeyModule();
    prismaMock.familySpace.findFirst.mockResolvedValue(null as any);
    prismaMock.familySpace.create.mockResolvedValue({
      id: 'space_default',
      name: 'Family Recipe',
      masterKeyHash: 'env-hash',
    } as any);

    await ensureFamilySpace('env-hash');

    expect(prismaMock.familySpace.create).toHaveBeenCalledWith({
      data: {
        name: 'Family Recipe',
        masterKeyHash: 'env-hash',
      },
    });
  });
});

describe('masterKeyEnvPresent', () => {
  it.each([
    {
      description: 'hash present',
      hash: '  hashed  ',
      key: undefined,
      expected: true,
    },
    {
      description: 'plain key present',
      hash: undefined,
      key: '  plain  ',
      expected: true,
    },
    {
      description: 'only whitespace',
      hash: '   ',
      key: '  ',
      expected: false,
    },
    {
      description: 'missing values',
      hash: undefined,
      key: undefined,
      expected: false,
    },
  ])('returns $expected when $description', ({ hash, key, expected }) => {
    if (typeof hash === 'string') {
      process.env.FAMILY_MASTER_KEY_HASH = hash;
    }
    if (typeof key === 'string') {
      process.env.FAMILY_MASTER_KEY = key;
    }

    const { masterKeyEnvPresent } = loadMasterKeyModule();

    expect(masterKeyEnvPresent()).toBe(expected);
  });
});
