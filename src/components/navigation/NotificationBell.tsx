'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch('/api/notifications/unread-count', {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadCount(
        typeof data.unreadCount === 'number' ? data.unreadCount : 0
      );
    } catch (error) {
      console.error('Failed to fetch unread notifications', error);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const badge = unreadCount > 9 ? '9+' : unreadCount.toString();

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-3 py-2 text-lg text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900/40"
      aria-label={
        unreadCount > 0
          ? `${unreadCount} unread notifications`
          : 'Notifications'
      }
    >
      <span aria-hidden>🔔</span>
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}
