/**
 * Regression guard: every `(app)` page must redirect to `/login?_se=1` — NOT
 * bare `/login` — when `resolvePageUser()` returns null.
 *
 * Why this is worth a test: a failed session call does not clear the
 * `refresh_token` cookie, and `src/proxy.ts` bounces /login → /timeline
 * whenever that cookie is present *unless* `_se=1` marks it as a session
 * error. A page redirecting to bare /login therefore loops
 * /timeline → /login → /timeline. The layout already uses `_se=1`; these pages
 * must agree with it. Nothing else in the suite pins this invariant, so an
 * edit back to `redirect('/login')` would otherwise pass CI silently.
 *
 * These are async server components. `redirect()` throws in real Next, which
 * short-circuits the page before it fetches any data — so the mock below
 * throws too, and no data-layer mocks are needed.
 */

const redirectMock = jest.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

jest.mock('@/lib/session', () => ({
  resolvePageUser: jest.fn(),
}));

import { resolvePageUser } from '@/lib/session';

const mockResolvePageUser = resolvePageUser as jest.MockedFunction<
  typeof resolvePageUser
>;

// `any` for props: each page declares its own props shape (`params` /
// `searchParams` / none), and this guard only needs to invoke them uniformly.
// A narrower type is contravariantly incompatible with the stricter pages.
type PageModule = { default: (props: any) => Promise<unknown> };

const postIdProps = { params: Promise.resolve({ postId: 'ctestpost001' }) };

const PAGES: Array<{
  name: string;
  load: () => Promise<PageModule>;
  props?: unknown;
}> = [
  { name: 'timeline', load: () => import('@/app/(app)/timeline/page') },
  {
    name: 'recipes',
    load: () => import('@/app/(app)/recipes/page'),
    props: { searchParams: Promise.resolve({}) },
  },
  { name: 'add', load: () => import('@/app/(app)/add/page') },
  {
    name: 'notifications',
    load: () => import('@/app/(app)/notifications/page'),
  },
  {
    name: 'family-members',
    load: () => import('@/app/(app)/family-members/page'),
  },
  { name: 'profile', load: () => import('@/app/(app)/profile/page') },
  {
    name: 'profile/settings',
    load: () => import('@/app/(app)/profile/settings/page'),
  },
  {
    name: 'profile/feedback',
    load: () => import('@/app/(app)/profile/feedback/page'),
  },
  {
    name: 'posts/[postId]',
    load: () => import('@/app/(app)/posts/[postId]/page'),
    props: postIdProps,
  },
  {
    name: 'posts/[postId]/edit',
    load: () => import('@/app/(app)/posts/[postId]/edit/page'),
    props: postIdProps,
  },
];

describe('(app) pages redirect on a failed session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvePageUser.mockResolvedValue(null);
  });

  it.each(PAGES)(
    '$name redirects to /login?_se=1 when resolvePageUser returns null',
    async ({ load, props }) => {
      const { default: Page } = await load();

      await expect(Page(props)).rejects.toThrow('NEXT_REDIRECT:/login?_se=1');

      expect(redirectMock).toHaveBeenCalledWith('/login?_se=1');
      // Guard the specific regression: never a bare /login, which loops.
      expect(redirectMock).not.toHaveBeenCalledWith('/login');
    }
  );
});
