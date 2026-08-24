import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ProfileTabs from '@/components/profile/ProfileTabs';
import { resolvePageUser } from '@/lib/session';
import {
  getUserCookedHistory,
  getUserFavorites,
  getUserPostsForProfile,
} from '@/lib/profile';

const INITIAL_LIMIT = 10;

export default async function ProfilePage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const [postsResult, cookedResult, favoritesResult] = await Promise.all([
    getUserPostsForProfile(user.id, user.familySpaceId, {
      limit: INITIAL_LIMIT,
      offset: 0,
    }),
    getUserCookedHistory(user.id, user.familySpaceId, {
      limit: INITIAL_LIMIT,
      offset: 0,
    }),
    getUserFavorites(user.id, user.familySpaceId, {
      limit: INITIAL_LIMIT,
      offset: 0,
    }),
  ]);

  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const isAdmin = user.role === 'owner' || user.role === 'admin';

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-[var(--bg-muted)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl">
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-2xl">
                👤
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--fg-caption)]">
                {roleLabel}
              </p>
              <h2 className="text-2xl font-semibold text-[var(--fg-strong)]">
                {user.name}
              </h2>
              <p className="text-sm text-[var(--fg-caption)]">
                Keeping the family cookbook alive.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/profile/settings"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-card)] px-4 py-2 text-sm font-semibold text-[var(--fg-body)] hover:bg-[var(--bg-page)]"
            >
              Account settings →
            </Link>
            {isAdmin && (
              <Link
                href="/profile/feedback"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-card)] px-4 py-2 text-sm font-semibold text-[var(--fg-body)] hover:bg-[var(--bg-page)]"
              >
                Feedback inbox →
              </Link>
            )}
            <Link
              href="/family-members"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-card)] px-4 py-2 text-sm font-semibold text-[var(--fg-body)] hover:bg-[var(--bg-page)]"
            >
              {isAdmin ? 'Manage family →' : 'Family members →'}
            </Link>
          </div>
        </div>
      </header>

      <ProfileTabs
        initialPosts={postsResult}
        initialCooked={cookedResult}
        initialFavorites={favoritesResult}
      />
    </section>
  );
}
