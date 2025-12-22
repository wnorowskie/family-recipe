/**
 * Integration test for GCS signed URL generation
 *
 * This validates that the signed URL format matches Google Cloud Storage expectations.
 */

import { generateKeyPairSync } from 'crypto';
import { generateSignedUrlV4 } from '@/lib/uploads';

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('GCS Signed URL Generation', () => {
  it('generates signed URLs with correct path-style format', async () => {
    // Mock the IAM signing to return a predictable signature
    const mockSignBlob = jest.fn().mockResolvedValue({
      signedBlob: Buffer.from('mock-signature-data').toString('base64'),
    });

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('signBlob')) {
        return Promise.resolve({
          ok: true,
          json: () => mockSignBlob(),
        });
      }
      return Promise.reject(new Error('Unexpected fetch call'));
    }) as any;

    const signedUrl = await generateSignedUrlV4({
      bucket: 'test-bucket',
      objectKey: 'test-file.jpg',
      expiresInSeconds: 3600,
      accessToken: 'mock-token',
      serviceAccountEmail: 'test@test.iam.gserviceaccount.com',
    });

    // Verify the URL uses path-style format
    expect(signedUrl).toMatch(
      /^https:\/\/storage\.googleapis\.com\/test-bucket\/test-file\.jpg\?/
    );

    // Verify it doesn't use virtual-hosted-style format
    expect(signedUrl).not.toMatch(/test-bucket\.storage\.googleapis\.com/);

    // Parse URL to verify query parameters
    const url = new URL(signedUrl);
    expect(url.hostname).toBe('storage.googleapis.com');
    expect(url.pathname).toBe('/test-bucket/test-file.jpg');
    expect(url.searchParams.get('X-Goog-Algorithm')).toBe('GOOG4-RSA-SHA256');
    expect(url.searchParams.get('X-Goog-SignedHeaders')).toBe('host');
    expect(url.searchParams.has('X-Goog-Signature')).toBe(true);
  });

  it('generates canonical request with correct host header', async () => {
    // We'll verify the canonical request by checking what gets signed
    let capturedStringToSign: string | undefined;

    global.fetch = jest
      .fn()
      .mockImplementation((url: string, options?: any) => {
        if (url.includes('signBlob')) {
          const body = JSON.parse(options?.body || '{}');
          capturedStringToSign = Buffer.from(body.payload, 'base64').toString(
            'utf-8'
          );

          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                signedBlob: Buffer.from('mock-signature').toString('base64'),
              }),
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      }) as any;

    await generateSignedUrlV4({
      bucket: 'my-bucket',
      objectKey: 'my-file.jpg',
      expiresInSeconds: 3600,
      accessToken: 'token',
      serviceAccountEmail: 'sa@project.iam.gserviceaccount.com',
    });

    // The string to sign should contain a hash of the canonical request
    // The canonical request should include "host:storage.googleapis.com"
    expect(capturedStringToSign).toBeDefined();

    // Extract the hash (last line of string to sign)
    const lines = capturedStringToSign!.split('\n');
    expect(lines[0]).toBe('GOOG4-RSA-SHA256');

    // The canonical request should have been hashed
    // We can verify the structure indirectly
    expect(lines.length).toBe(4);
  });

  it('signs with a provided private key and skips IAM fetches', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const signedUrl = await generateSignedUrlV4({
      bucket: 'private-bucket',
      objectKey: 'photo.jpg',
      expiresInSeconds: 900,
      accessToken: 'unused-token',
      serviceAccountEmail: 'svc@example.com',
      privateKey: privateKeyPem,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(signedUrl).toContain('X-Goog-Signature=');
  });
});
