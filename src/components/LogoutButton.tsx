'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiClient } from '@/lib/apiClient';
import { clearSession } from '@/lib/authStore';
import { isFastApiAuthEnabled } from '@/lib/featureFlags';

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);

    if (isFastApiAuthEnabled()) {
      try {
        await apiClient.post('/v1/auth/logout');
      } catch {
        // Fall through — clearing the local session is more important than
        // surfacing a logout API error to the user.
      }
      clearSession();
      router.push('/login');
      router.refresh();
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? 'Logging out...' : 'Log Out'}
    </button>
  );
}
