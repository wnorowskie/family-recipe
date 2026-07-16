import Link from 'next/link';
import { redirect } from 'next/navigation';
import AddPostForm from '@/components/add/AddPostForm';
import LogoutButton from '@/components/LogoutButton';
import { resolvePageUser } from '@/lib/session';

export default async function AddPostPage() {
  const user = await resolvePageUser();

  if (!user) {
    // `_se=1` marks a session error so the middleware lets /login through;
    // see resolvePageUser in src/lib/session.ts.
    redirect('/login?_se=1');
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
