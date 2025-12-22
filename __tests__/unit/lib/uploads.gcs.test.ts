import path from 'path';
import { generateKeyPairSync } from 'crypto';

const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();
type LogWarn = (event: string, payload: Record<string, unknown>) => void;
const logWarnMock: jest.MockedFunction<LogWarn> = jest.fn();

jest.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    unlink: mockUnlink,
  },
}));

jest.mock('@/lib/logger', () => ({
  logWarn: logWarnMock,
}));

jest.mock('../../../src/lib/logger', () => ({
  logWarn: logWarnMock,
}));

type UploadsModule = typeof import('@/lib/uploads');

const TEST_PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

const loadUploadsModule = (): UploadsModule => {
  let mod: UploadsModule;
  jest.isolateModules(() => {
    mod = require('@/lib/uploads');
  });
  return mod!;
};

const createMockFile = (options?: {
  name?: string;
  type?: string;
  size?: number;
  data?: string;
}) => {
  const {
    name = 'photo.png',
    type = 'image/png',
    size = 1024,
    data = 'pixels',
  } = options ?? {};

  const arrayBuffer = jest.fn(
    async () => new TextEncoder().encode(data).buffer
  );

  return {
    file: {
      name,
      type,
      size,
      arrayBuffer,
    } as unknown as File,
    arrayBuffer,
  };
};

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.UPLOADS_BUCKET;
  delete process.env.UPLOADS_SIGNED_URL_TTL_SECONDS;
  delete process.env.GCS_SIGNING_PRIVATE_KEY;
  delete process.env.UPLOADS_BASE_URL;
  mockMkdir.mockReset();
  mockWriteFile.mockReset();
  mockUnlink.mockReset();
  logWarnMock.mockReset();
  mockMkdir.mockResolvedValue(undefined as any);
  mockWriteFile.mockResolvedValue(undefined as any);
  mockUnlink.mockResolvedValue(undefined as any);
  global.fetch = jest.fn() as any;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('Uploads - GCS and helpers', () => {
  it('detects file-like objects', () => {
    const uploads = loadUploadsModule();
    const valid = {
      size: 10,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    };
    expect(uploads.isFileLike(valid)).toBe(true);
    expect(uploads.isFileLike(null)).toBe(false);
    expect(
      uploads.isFileLike({
        size: '10',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    ).toBe(false);
    expect(
      uploads.isFileLike({
        size: 5,
        arrayBuffer: 'not-a-function',
      })
    ).toBe(false);
  });

  it('memoizes signed URL resolutions per storage key', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    process.env.GCS_SIGNING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const uploads = loadUploadsModule();

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith('/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'token-123' }),
        }) as any;
      }
      if (url.endsWith('/email')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('svc@example.com'),
        }) as any;
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const resolver = uploads.createSignedUrlResolver();

    const [first, second] = await Promise.all([
      resolver('photo.png'),
      resolver('photo.png'),
    ]);

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns local URLs when no bucket is configured', async () => {
    const uploads = loadUploadsModule();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    const url = await uploads.getSignedUploadUrl('photo.jpg');

    expect(url).toBe('/uploads/photo.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches metadata and generates signed URLs when bucket is set', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    process.env.GCS_SIGNING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.UPLOADS_SIGNED_URL_TTL_SECONDS = '120';
    const uploads = loadUploadsModule();

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith('/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'token-abc' }),
        }) as any;
      }
      if (url.endsWith('/email')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('svc@example.com'),
        }) as any;
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const url = await uploads.getSignedUploadUrl('photos/pic.png');

    expect(
      url && url.startsWith('https://storage.googleapis.com/family-bucket/')
    ).toBe(true);
    expect(url).toContain('photos/pic.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deletes remote uploads and logs failures for unexpected statuses', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    const uploads = loadUploadsModule();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const deleteStatuses = [204, 500];

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, options?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.endsWith('/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'token-xyz' }),
          }) as any;
        }
        if (options?.method === 'DELETE') {
          const status = deleteStatuses.shift() ?? 204;
          return Promise.resolve({ ok: status < 400, status }) as any;
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }
    );

    await uploads.deleteUploadedFiles([
      'https://storage.googleapis.com/family-bucket/photos/a.jpg',
      '/uploads/leftover.jpg',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logWarnMock).toHaveBeenCalledWith('uploads.delete.gcs.failed', {
      key: 'leftover.jpg',
      status: 500,
    });
  });

  it('falls back to local deletion when GCS metadata fetch fails', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    const uploads = loadUploadsModule();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockRejectedValue(new Error('metadata down'));

    const publicDir = path.join(process.cwd(), 'public');
    const firstPath = path.join(publicDir, 'uploads/photo.jpg');
    const secondPath = path.join(publicDir, 'uploads/second.png');
    const thirdPath = path.join(publicDir, 'uploads/third.png');

    mockUnlink.mockResolvedValueOnce(undefined as any);
    const unlinkError = Object.assign(new Error('no access'), {
      code: 'EACCES',
    });
    mockUnlink.mockRejectedValueOnce(unlinkError);
    const enoentError = Object.assign(new Error('missing'), {
      code: 'ENOENT',
    });
    mockUnlink.mockRejectedValueOnce(enoentError);

    await uploads.deleteUploadedFiles([
      '/uploads/photo.jpg',
      'second.png',
      'third.png',
    ]);

    expect(mockUnlink).toHaveBeenNthCalledWith(1, firstPath);
    expect(mockUnlink).toHaveBeenNthCalledWith(2, secondPath);
    expect(mockUnlink).toHaveBeenNthCalledWith(3, thirdPath);
    expect(logWarnMock).toHaveBeenCalledWith('uploads.delete.gcs.error', {
      message: 'metadata down',
    });
    expect(logWarnMock).toHaveBeenCalledWith('uploads.delete.local.failed', {
      path: secondPath,
      error: 'no access',
    });
    expect(
      logWarnMock.mock.calls.filter(
        ([event]) => event === 'uploads.delete.local.failed'
      )
    ).toHaveLength(1);
  });

  it('uploads to GCS and returns signed URLs when remote flow succeeds', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    process.env.UPLOADS_SIGNED_URL_TTL_SECONDS = '3600';
    process.env.GCS_SIGNING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const uploads = loadUploadsModule();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, options?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.endsWith('/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'token-abcd' }),
          }) as any;
        }
        if (url.endsWith('/email')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('svc@example.com'),
          }) as any;
        }
        if (url.startsWith('https://storage.googleapis.com/upload')) {
          expect(options?.method).toBe('POST');
          return Promise.resolve({ ok: true, status: 200 }) as any;
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }
    );

    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const { file } = createMockFile({ type: 'image/jpeg', data: 'abc' });

    const result = await uploads.savePhotoFile(file);

    expect(
      result.url.startsWith('https://storage.googleapis.com/family-bucket/')
    ).toBe(true);
    expect(result.filePath).toBe(`gs://family-bucket/${result.storageKey}`);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockMkdir).not.toHaveBeenCalled();

    dateSpy.mockRestore();
  });

  it('logs warnings and falls back to local storage when GCS upload fails', async () => {
    process.env.UPLOADS_BUCKET = 'family-bucket';
    const uploads = loadUploadsModule();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, options?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.endsWith('/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'token-abcd' }),
          }) as any;
        }
        if (url.endsWith('/email')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('svc@example.com'),
          }) as any;
        }
        if (url.startsWith('https://storage.googleapis.com/upload')) {
          return Promise.resolve({ ok: false, status: 500 }) as any;
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }
    );

    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000001234);
    const { file } = createMockFile({ type: 'image/png' });

    const result = await uploads.savePhotoFile(file);
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const expectedPath = path.join(uploadDir, result.storageKey);

    expect(logWarnMock).toHaveBeenCalledWith('uploads.gcs.fallback_to_local', {
      message: 'GCS_UPLOAD_FAILED_500',
    });
    expect(mockMkdir).toHaveBeenCalledWith(uploadDir, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedPath,
      expect.any(Buffer)
    );
    expect(mockMkdir.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteFile.mock.invocationCallOrder[0]
    );
    expect(result.url).toBe(`/uploads/${result.storageKey}`);
    expect(
      (fetchMock.mock.calls || []).some(
        ([url]) => typeof url === 'string' && url.includes('signBlob')
      )
    ).toBe(false);

    dateSpy.mockRestore();
  });
});
