import { promises as fs } from 'fs';
import path from 'path';
import { createHash, createSign, randomUUID } from 'crypto';
import { logWarn } from './logger';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB per photo
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const GCS_API_BASE = 'https://storage.googleapis.com';
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const SIGNED_URL_TTL_SECONDS = Number(
  process.env.UPLOADS_SIGNED_URL_TTL_SECONDS ?? '3600'
);

export interface SavedUpload {
  url: string;
  filePath?: string;
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

function encodeRFC3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function encodePath(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeRFC3986(segment))
    .join('/');
}

async function fetchMetadata(pathname: string): Promise<string> {
  const response = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/${pathname}`,
    {
      headers: {
        'Metadata-Flavor': 'Google',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`METADATA_UNAVAILABLE_${pathname}`);
  }

  return response.text();
}

async function getGcpAccessToken(): Promise<string> {
  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    {
      headers: {
        'Metadata-Flavor': 'Google',
      },
    }
  );

  if (!response.ok) {
    throw new Error('METADATA_TOKEN_UNAVAILABLE');
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('METADATA_TOKEN_MISSING');
  }

  return data.access_token;
}

async function signStringWithIam(
  stringToSign: string,
  accessToken: string,
  serviceAccountEmail: string
): Promise<string> {
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
      serviceAccountEmail
    )}:signBlob`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: Buffer.from(stringToSign).toString('base64'),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`SIGN_BLOB_FAILED_${response.status}`);
  }

  const data = (await response.json()) as { signedBlob?: string };
  if (!data.signedBlob) {
    throw new Error('SIGN_BLOB_MISSING');
  }

  return data.signedBlob;
}

function signStringWithPrivateKey(
  stringToSign: string,
  privateKey: string
): string {
  const signer = createSign('RSA-SHA256');
  signer.update(stringToSign);
  signer.end();
  // Return base64-encoded signature for downstream hex conversion
  return signer.sign(privateKey, 'base64');
}

async function generateSignedUrlV4(options: {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
  accessToken: string;
  serviceAccountEmail: string;
  privateKey?: string;
}): Promise<string> {
  const {
    bucket,
    objectKey,
    expiresInSeconds,
    accessToken,
    serviceAccountEmail,
    privateKey,
  } = options;

  const now = new Date();
  const datestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
  const timestamp =
    now
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14) + 'Z';
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;

  const canonicalQuery = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', timestamp],
    ['X-Goog-Expires', String(expiresInSeconds)],
    ['X-Goog-SignedHeaders', 'host'],
  ]
    .map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`)
    .sort()
    .join('&');

  const canonicalUri = `/${bucket}/${encodePath(objectKey)}`;
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    'host:storage.googleapis.com',
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const hash = createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    timestamp,
    credentialScope,
    hash,
  ].join('\n');

  let signature: string;
  if (privateKey) {
    const signedBase64 = signStringWithPrivateKey(stringToSign, privateKey);
    signature = Buffer.from(signedBase64, 'base64').toString('hex');
  } else {
    const signedBlob = await signStringWithIam(
      stringToSign,
      accessToken,
      serviceAccountEmail
    );
    signature = Buffer.from(signedBlob, 'base64').toString('hex');
  }

  const signedUrl = `${GCS_API_BASE}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
  return signedUrl;
}

async function uploadToGcs(options: {
  bucket: string;
  objectKey: string;
  buffer: Buffer;
  contentType: string;
  accessToken: string;
}): Promise<void> {
  const { bucket, objectKey, buffer, contentType, accessToken } = options;
  const uploadUrl = `${GCS_API_BASE}/upload/storage/v1/b/${encodeRFC3986(
    bucket
  )}/o?uploadType=media&name=${encodeRFC3986(objectKey)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    throw new Error(`GCS_UPLOAD_FAILED_${response.status}`);
  }
}

function extractGcsObjectKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (!parts.length) {
      return null;
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      if (parts[0] === UPLOADS_BUCKET) {
        return parts.slice(1).join('/');
      }
      // Signed URLs default include bucket in the path
      return parts.slice(1).join('/');
    }

    if (parsed.protocol === 'gs:') {
      return parts.slice(1).join('/');
    }

    if (process.env.UPLOADS_BASE_URL) {
      const base = new URL(process.env.UPLOADS_BASE_URL);
      if (parsed.origin === base.origin) {
        const basePath = base.pathname.replace(/\/+$/, '');
        let relPath = parsed.pathname;
        if (basePath && relPath.startsWith(basePath)) {
          relPath = relPath.slice(basePath.length);
        }
        return relPath.replace(/^\/+/, '');
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

export async function deleteUploadedFiles(
  urls: Array<string | null | undefined>
): Promise<void> {
  const filtered = urls.filter(Boolean) as string[];
  if (!filtered.length) {
    return;
  }

  if (UPLOADS_BUCKET) {
    try {
      const accessToken = await getGcpAccessToken();
      await Promise.all(
        filtered.map(async (url) => {
          const key = extractGcsObjectKey(url);
          if (!key) {
            return;
          }
          const deleteUrl = `${GCS_API_BASE}/storage/v1/b/${encodeRFC3986(
            UPLOADS_BUCKET
          )}/o/${encodeRFC3986(key)}`;
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          if (!response.ok && response.status !== 404) {
            logWarn('uploads.delete.gcs.failed', {
              key,
              status: response.status,
            });
          }
        })
      );
      return;
    } catch (error) {
      logWarn('uploads.delete.gcs.error', {
        message: (error as Error)?.message ?? String(error),
      });
    }
  }

  const publicDir = path.join(process.cwd(), 'public');
  await Promise.all(
    filtered.map(async (url) => {
      if (!url.startsWith('/uploads/')) {
        return;
      }

      const relativePath = url.replace(/^\/+/, '');
      const absolutePath = path.join(publicDir, relativePath);

      try {
        await fs.unlink(absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logWarn('uploads.delete.local.failed', {
            path: absolutePath,
            error: (error as Error)?.message ?? String(error),
          });
        }
      }
    })
  );
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

  if (UPLOADS_BUCKET) {
    try {
      const accessToken = await getGcpAccessToken();
      const serviceAccountEmail = await fetchMetadata(
        'instance/service-accounts/default/email'
      );
      const privateKey = process.env.GCS_SIGNING_PRIVATE_KEY;

      await uploadToGcs({
        bucket: UPLOADS_BUCKET,
        objectKey: filename,
        buffer,
        contentType: file.type ?? 'application/octet-stream',
        accessToken,
      });

      const signedUrl = await generateSignedUrlV4({
        bucket: UPLOADS_BUCKET,
        objectKey: filename,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        accessToken,
        serviceAccountEmail,
        privateKey,
      });

      return {
        url: signedUrl,
        filePath: `gs://${UPLOADS_BUCKET}/${filename}`,
      };
    } catch (error) {
      logWarn('uploads.gcs.fallback_to_local', {
        message: (error as Error)?.message ?? String(error),
      });
      // Fall through to local write below
    }
  }

  const destination = path.join(UPLOAD_DIR, filename);
  await ensureUploadDir();
  await fs.writeFile(destination, buffer);

  return {
    url: `/uploads/${filename}`,
    filePath: destination,
  };
}
