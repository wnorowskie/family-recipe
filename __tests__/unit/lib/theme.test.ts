/**
 * @jest-environment jsdom
 */
import { applyThemeToDocument } from '@/lib/theme';

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
