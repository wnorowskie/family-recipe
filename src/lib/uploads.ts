import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB per photo
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface SavedUpload {
  url: string;
  filePath: string;
}

type FileLike = {
  name?: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function isFileLike(value: unknown): value is FileLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).arrayBuffer === 'function' &&
    typeof (value as any).size === 'number'
  );
}

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function getFileExtension(file: FileLike): string {
  const nameExt = file.name ? path.extname(file.name) : '';
  if (nameExt) {
    return nameExt;
  }

  switch (file.type) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}

export async function savePhotoFile(file: FileLike): Promise<SavedUpload> {
  if (!ALLOWED_MIME_TYPES.has(file.type ?? 'image/jpeg')) {
    throw new Error('UNSUPPORTED_FILE_TYPE');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = getFileExtension(file);
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const destination = path.join(UPLOAD_DIR, filename);

  await ensureUploadDir();
  await fs.writeFile(destination, buffer);

  return {
    url: `/uploads/${filename}`,
    filePath: destination,
  };
}
