import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import FamilyMembersAdmin from '@/components/family/FamilyMembersAdmin';
import { getCurrentUser } from '@/lib/session';
import { getFamilyMembers } from '@/lib/family';

export default async function FamilyMembersPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');

  if (!sessionCookie) {
    redirect('/login');
  }

  const mockRequest = {
    cookies: {
      get: () => sessionCookie,
    },
  } as any;

  const user = await getCurrentUser(mockRequest);

  if (!user) {
    redirect('/login');
  }

  const isAdminUser = user.role === 'owner' || user.role === 'admin';
  const members = await getFamilyMembers(user.familySpaceId);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Family space</p>
        <h2 className="text-2xl font-semibold text-gray-900">Members</h2>
        <p className="text-sm text-gray-500">
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
