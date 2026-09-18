/**
 * Regression guard for the flash-free theme mechanism (#155): the root
 * layout must set `<html data-theme="warm">` when — and only when — the
 * `theme` cookie's value is the literal string `'warm'`, with no FastAPI
 * call involved (see the comment in src/app/layout.tsx for why).
 *
 * `RootLayout` is an async server component; calling it directly returns
 * the constructed React element tree without needing a DOM renderer,
 * mirroring the pattern in app-page-auth-redirect.test.ts.
 *
 * The same cookie drives the `theme-color` meta via `generateViewport`
 * (#349), so both are covered here.
 */

jest.mock('next/font/local', () => () => ({ variable: '--font-display' }));

jest.mock('@/components/feedback/FeedbackWidget', () => () => null);

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

import { cookies } from 'next/headers';
import RootLayout, { generateViewport, metadata } from '@/app/layout';
import { PAGE_THEME_COLOR } from '@/lib/theme';

const mockCookies = cookies as jest.MockedFunction<typeof cookies>;

function mockThemeCookie(value: string | undefined) {
  mockCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'theme' && value !== undefined ? { name, value } : undefined,
  } as never);
}

describe('RootLayout theme cookie', () => {
  it('sets data-theme="warm" when the cookie is warm', async () => {
    mockThemeCookie('warm');

    const element = (await RootLayout({ children: 'content' })) as {
      props: Record<string, unknown>;
    };

    expect(element.props['data-theme']).toBe('warm');
  });

  it('omits data-theme when the cookie is grayscale', async () => {
    mockThemeCookie('grayscale');

    const element = (await RootLayout({ children: 'content' })) as {
      props: Record<string, unknown>;
    };

    expect(element.props['data-theme']).toBeUndefined();
  });

  it('omits data-theme when the cookie is absent (logged out)', async () => {
    mockThemeCookie(undefined);

    const element = (await RootLayout({ children: 'content' })) as {
      props: Record<string, unknown>;
    };

    expect(element.props['data-theme']).toBeUndefined();
  });

  it('omits data-theme for a tampered cookie value', async () => {
    mockThemeCookie('sepia');

    const element = (await RootLayout({ children: 'content' })) as {
      props: Record<string, unknown>;
    };

    expect(element.props['data-theme']).toBeUndefined();
  });
});

describe('generateViewport theme-color (#349)', () => {
  it('uses the warm page background when the cookie is warm', async () => {
    mockThemeCookie('warm');
    expect(await generateViewport()).toEqual({
      themeColor: PAGE_THEME_COLOR.warm,
    });
  });

  it.each([
    ['grayscale', 'grayscale'],
    ['absent (logged out)', undefined],
    ['tampered', 'sepia'],
  ])(
    'uses the default page background when the cookie is %s',
    async (_, value) => {
      mockThemeCookie(value);
      expect(await generateViewport()).toEqual({
        themeColor: PAGE_THEME_COLOR.default,
      });
    }
  );
});

describe('installed-app metadata (#349)', () => {
  it('declares the iOS standalone meta through the metadata API', () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      statusBarStyle: 'default',
      title: 'Family Recipe',
    });
    // Next emits `mobile-web-app-capable` for `capable`; iOS < 17.4 only
    // honours the Apple-prefixed tag, so that one is set explicitly.
    expect(metadata.other).toMatchObject({
      'apple-mobile-web-app-capable': 'yes',
    });
  });
});
