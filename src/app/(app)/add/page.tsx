import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AddPostForm from '@/components/add/AddPostForm';
import LogoutButton from '@/components/LogoutButton';
import { getCurrentUser, resolvePageUser } from '@/lib/session';

export default async function AddPostPage() {
  const fastApiUser = await resolvePageUser();

  const user =
    fastApiUser ??
    (await (async () => {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('session');
      if (!sessionCookie) redirect('/login');
      const mockRequest = { cookies: { get: () => sessionCookie } } as any;
      return getCurrentUser(mockRequest);
    })());

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Hey {user.name.split(' ')[0]}, what&apos;s cooking?
          </h2>
          <p className="text-sm text-gray-600">
            Add a quick post or expand it into a full recipe for the family.
          </p>
        </div>
        <AddPostForm />
      </div>
    </div>
  );
}
