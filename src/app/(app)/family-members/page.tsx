import { redirect } from 'next/navigation';
import FamilyMembersAdmin from '@/components/family/FamilyMembersAdmin';
import { resolvePageUser } from '@/lib/session';
import { getFamilyMembers } from '@/lib/family';

export default async function FamilyMembersPage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
  }

  const isAdminUser = user.role === 'owner' || user.role === 'admin';
  const members = await getFamilyMembers(user.familySpaceId);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--fg-caption)]">
          Family space
        </p>
        <h2 className="text-2xl font-semibold text-[var(--fg-strong)]">
          Members
        </h2>
        <p className="text-sm text-[var(--fg-caption)]">
          {isAdminUser
            ? 'Manage who has access to the family recipe app.'
            : 'See everyone who shares and cooks inside the family space. Only admins can manage access.'}
        </p>
      </div>
      <FamilyMembersAdmin
        initialMembers={members}
        currentUserId={user.id}
        currentUserRole={user.role}
      />
    </section>
  );
}
