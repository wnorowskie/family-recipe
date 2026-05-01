'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient, ApiError } from '@/lib/apiClient';
import { isFastApiAuthEnabled } from '@/lib/featureFlags';

interface NotificationBellProps {
  initialCount: number;
}

interface UnreadCountResponse {
  unreadCount: number;
}

export default function NotificationBell({
  initialCount,
}: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState<number>(initialCount);

  useEffect(() => {
    const fastApiOn = isFastApiAuthEnabled();

    const refresh = async () => {
      try {
        if (fastApiOn) {
          const data = await apiClient.get<UnreadCountResponse>(
            '/v1/notifications/unread-count'
          );
          setUnreadCount(
            typeof data.unreadCount === 'number' ? data.unreadCount : 0
          );
          return;
        }
        const response = await fetch('/api/notifications/unread-count', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = (await response.json()) as UnreadCountResponse;
        setUnreadCount(
          typeof data.unreadCount === 'number' ? data.unreadCount : 0
        );
      } catch (error) {
        // Ignore 401s: AuthBootstrap may not have minted the access token
        // yet on first render. The 60s interval below will retry.
        if (error instanceof ApiError && error.status === 401) return;
        console.error('Failed to fetch unread notifications', error);
      }
    };

    // Flag-on layout intentionally renders with initialCount=0; refresh
    // immediately so the badge reflects reality post-hydration. Flag-off
    // layout SSR-prefetches via Prisma, so the immediate call is just an
    // extra round-trip — the interval below is enough.
    if (fastApiOn) {
      refresh();
    }
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, []);

  const badge = unreadCount > 9 ? '9+' : unreadCount.toString();

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900/40"
      aria-label={
        unreadCount > 0
          ? `${unreadCount} unread notifications`
          : 'Notifications'
      }
    >
      <Bell size={20} aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}
