import { redirect } from 'next/navigation';
import AccountSettingsForm from '@/components/profile/AccountSettingsForm';
import { resolvePageUser } from '@/lib/session';

export default async function SettingsPage() {
  const user = await resolvePageUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Account</p>
        <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500">
          Update your profile details and credentials.
        </p>
      </div>
      <AccountSettingsForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
        }}
      />
    </section>
  );
}
