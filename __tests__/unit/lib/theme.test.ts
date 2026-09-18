/**
 * @jest-environment jsdom
 */
import {
  PAGE_THEME_COLOR,
  applyThemeToDocument,
  pageThemeColor,
} from '@/lib/theme';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('applyThemeToDocument', () => {
  it('sets data-theme="warm" for the literal warm value', () => {
    applyThemeToDocument('warm');
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
  });

  it('removes data-theme for grayscale', () => {
    document.documentElement.setAttribute('data-theme', 'warm');
    applyThemeToDocument('grayscale');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it.each([undefined, null, '', 'WARM', 'neon'])(
    'treats %p as the default and clears the attribute (mirrors RootLayout)',
    (value) => {
      document.documentElement.setAttribute('data-theme', 'warm');
      applyThemeToDocument(value);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    }
  );
});

describe('pageThemeColor', () => {
  it('returns the warm page background for the literal warm value', () => {
    expect(pageThemeColor('warm')).toBe(PAGE_THEME_COLOR.warm);
  });

  it.each([undefined, null, '', 'grayscale', 'WARM', 'neon'])(
    'treats %p as the default palette (mirrors RootLayout)',
    (value) => {
      expect(pageThemeColor(value)).toBe(PAGE_THEME_COLOR.default);
    }
  );

  it('uses distinct sRGB hex values for the two palettes', () => {
    expect(PAGE_THEME_COLOR.default).toMatch(/^#[0-9a-f]{6}$/);
    expect(PAGE_THEME_COLOR.warm).toMatch(/^#[0-9a-f]{6}$/);
    expect(PAGE_THEME_COLOR.warm).not.toBe(PAGE_THEME_COLOR.default);
  });
});
