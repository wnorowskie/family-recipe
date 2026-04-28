import { isFastApiAuthEnabled } from '@/lib/featureFlags';

describe('isFastApiAuthEnabled', () => {
  const original = process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH;
    } else {
      process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH = original;
    }
  });

  it('returns false when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH;
    expect(isFastApiAuthEnabled()).toBe(false);
  });

  it('returns true only for the literal string "true"', () => {
    process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH = 'true';
    expect(isFastApiAuthEnabled()).toBe(true);
  });

  it('returns false for other truthy-looking values', () => {
    for (const value of ['1', 'TRUE', 'yes', 'on']) {
      process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH = value;
      expect(isFastApiAuthEnabled()).toBe(false);
    }
  });
});
