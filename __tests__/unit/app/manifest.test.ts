/**
 * Web app manifest (#349): the fields iOS Safari and Android Chrome need
 * for install, and the icon set from #348. The icon files themselves must
 * exist at the referenced paths or the install audit fails silently.
 */
import { existsSync } from 'fs';
import path from 'path';
import manifest from '@/app/manifest';
import { PAGE_THEME_COLOR } from '@/lib/theme';

describe('manifest.webmanifest', () => {
  const m = manifest();

  it('has the fields required for install', () => {
    expect(m).toMatchObject({
      name: 'Family Recipe',
      short_name: expect.any(String),
      start_url: '/',
      display: 'standalone',
      background_color: PAGE_THEME_COLOR.default,
      theme_color: PAGE_THEME_COLOR.default,
    });
  });

  it('lists 192, 512 and maskable 512 icons that exist in public/', () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => [i.sizes, i.purpose ?? 'any'])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/icons/')).toBe(true);
      expect(existsSync(path.join(process.cwd(), 'public', icon.src))).toBe(
        true
      );
    }
  });
});
