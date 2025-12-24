'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface AccountSettingsFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    username: string;
    avatarUrl: string | null;
  };
}

export default function AccountSettingsForm({
  user,
}: AccountSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatarUrl
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profilePassword, setProfilePassword] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(user.avatarUrl);
      setRemoveAvatar(false);
      return;
    }

    setAvatarFile(file);
    setRemoveAvatar(false);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview(null);
    setAvatarFile(null);
    setRemoveAvatar(true);
  };

  const handleProfileSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedUsername = username.trim();
      const requiresPassword =
        trimmedEmail !== user.email || trimmedUsername !== user.username;

      if (requiresPassword && !profilePassword) {
        throw new Error(
          'Enter your current password to change email or username'
        );
      }

      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('email', trimmedEmail);
      formData.append('username', trimmedUsername);
      formData.append('removeAvatar', String(removeAvatar));
      if (profilePassword) {
        formData.append('currentPassword', profilePassword);
      }

      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const response = await fetch('/api/me/profile', {
        method: 'PATCH',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to update profile');
      }

      setProfileSuccess(
        requiresPassword
          ? 'Profile updated. You may need to log in again.'
          : 'Profile updated'
      );
      setRemoveAvatar(false);
      setAvatarFile(null);
      if (requiresPassword) {
        setProfilePassword('');
      }
      router.refresh();
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'Failed to update profile'
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsSavingPassword(true);

    try {
      const response = await fetch('/api/me/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to update password');
      }

      setPasswordSuccess('Password updated. Please log in again.');
      setCurrentPassword('');
      setNewPassword('');
      // Session cookie is cleared server-side; force a full redirect so middleware re-runs immediately.
      window.location.href = '/login';
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'Failed to update password'
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setDeleteError(null);
    setDeleteSuccess(null);
    setIsDeleting(true);

    if (deleteConfirmation.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm');
      setIsDeleting(false);
      return;
    }

    try {
      const response = await fetch('/api/me/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to delete account');
      }

      setDeleteSuccess('Account deleted. Redirecting…');
      setTimeout(() => {
        window.location.href = '/login';
      }, 800);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Failed to delete account'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleProfileSubmit}
        className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Profile</h3>
          <p className="text-sm text-gray-500">Update your display info.</p>
        </div>

        <div className="flex items-center gap-4">
          {avatarPreview ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl">
              <Image
                src={avatarPreview}
                alt={name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
              👤
            </div>
          )}
          <div className="space-y-2 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-blue-600">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              Change photo
            </label>
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-xs text-gray-500 underline"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="name"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="username"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="profilePassword"
            >
              Current password (required for email/username changes)
            </label>
            <input
              id="profilePassword"
              name="profilePassword"
              type="password"
              value={profilePassword}
              onChange={(event) => setProfilePassword(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
        {profileSuccess && (
          <p className="text-sm text-green-600">{profileSuccess}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSavingProfile}
            className="rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSavingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Password</h3>
          <p className="text-sm text-gray-500">Keep your account secure.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="currentPassword"
            >
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="newPassword"
            >
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
              minLength={8}
            />
          </div>
        </div>

        {passwordError && (
          <p className="text-sm text-red-600">{passwordError}</p>
        )}
        {passwordSuccess && (
          <p className="text-sm text-green-600">{passwordSuccess}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSavingPassword}
            className="rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isSavingPassword ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>

      <form
        onSubmit={handleDeleteAccount}
        className="rounded-3xl border border-red-100 bg-white p-6 shadow-sm space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Delete account
          </h3>
          <p className="text-sm text-red-600">
            This will permanently delete your account and data. Owners/admins
            cannot delete their accounts.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="deletePassword"
            >
              Current password
            </label>
            <input
              id="deletePassword"
              name="deletePassword"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-gray-700"
              htmlFor="deleteConfirmation"
            >
              Type DELETE to confirm
            </label>
            <input
              id="deleteConfirmation"
              name="deleteConfirmation"
              type="text"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-600 uppercase"
              placeholder="DELETE"
              required
            />
          </div>
        </div>

        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        {deleteSuccess && (
          <p className="text-sm text-green-600">{deleteSuccess}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isDeleting}
            className="rounded-full border border-red-300 px-6 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </div>
  );
}
