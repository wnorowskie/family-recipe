/**
 * Unit tests for uploads utilities
 *
 * Covers validation, extension resolution, directory creation, and file writing.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { savePhotoFile } from '@/lib/uploads';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockRandomUUID = randomUUID as jest.MockedFunction<typeof randomUUID>;

const createMockFile = (options: {
  name?: string;
  type?: string;
  size?: number;
  data?: string;
}) => {
  const { name = 'photo.jpg', type = 'image/jpeg', size = 100, data = 'data' } = options;
  const arrayBufferMock = jest.fn(async () => new TextEncoder().encode(data).buffer);
  const file = {
    name,
    type,
    size,
    arrayBuffer: arrayBufferMock,
  } as unknown as File;

  return { file, arrayBufferMock };
};

describe('Uploads Utilities', () => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined as any);
    mockRandomUUID.mockReturnValue('12345678-1234-1234-1234-123456789abc' as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects unsupported file types', async () => {
    const { file } = createMockFile({ type: 'application/pdf' });

    await expect(savePhotoFile(file)).rejects.toThrow('UNSUPPORTED_FILE_TYPE');

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('rejects files that exceed max size before reading contents', async () => {
    const { file, arrayBufferMock } = createMockFile({
      type: 'image/png',
      size: 8 * 1024 * 1024 + 1,
    });

    await expect(savePhotoFile(file)).rejects.toThrow('FILE_TOO_LARGE');

    expect(arrayBufferMock).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('uses extension from filename and writes buffer to disk', async () => {
    const { file, arrayBufferMock } = createMockFile({
      name: 'dessert.jpeg',
      type: 'image/jpeg',
      data: 'sweet',
    });
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const result = await savePhotoFile(file);

    const expectedName = '1700000000000-uuid-123.jpeg';
    const expectedPath = path.join(uploadDir, expectedName);
    expect(result).toEqual({
      url: `/uploads/${expectedName}`,
      filePath: expectedPath,
    });
    expect(mockMkdir).toHaveBeenCalledWith(uploadDir, { recursive: true });
    expect(mockMkdir.mock.invocationCallOrder[0]).toBeLessThan(
      mockWriteFile.mock.invocationCallOrder[0]
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedPath,
      Buffer.from(new TextEncoder().encode('sweet'))
    );
    expect(arrayBufferMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { type: 'image/png', expectedExt: '.png' },
    { type: 'image/webp', expectedExt: '.webp' },
    { type: 'image/gif', expectedExt: '.gif' },
    { type: 'image/jpeg', expectedExt: '.jpg' }, // default fallback
  ])('derives extension from mime type when name lacks ext: $type', async ({ type, expectedExt }) => {
    const { file } = createMockFile({ name: 'upload', type });
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mockRandomUUID.mockReturnValue('ffffffff-ffff-ffff-ffff-ffffffffffff' as any);

    const result = await savePhotoFile(file);

    expect(result.url).toBe(`/uploads/1700000000000-fixed${expectedExt}`);
    expect(result.filePath).toBe(path.join(uploadDir, `1700000000000-fixed${expectedExt}`));
  });
});
