'use client';

import { useEffect, useState } from 'react';
import NotificationCard from './NotificationCard';

export type NotificationResponseItem = {
  id: string;
  type: 'comment' | 'reaction_batch' | 'cooked';
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  post: {
    id: string;
    title: string;
    mainPhotoUrl: string | null;
  };
  commentText?: string | null;
  cookedNote?: string | null;
  cookedRating?: number | null;
  reactionSummary?: {
    totalCount: number;
    emojiCounts: Array<{ emoji: string; count: number }>;
    lastEmoji?: string;
  };
};

interface ApiResponse {
  notifications: NotificationResponseItem[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset: number;
}

const PAGE_SIZE = 20;

export default function NotificationsFeed() {
  const [notifications, setNotifications] = useState<
    NotificationResponseItem[]
  >([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (err) {
      console.error('Failed to mark notifications as read', err);
    }
  };

  const fetchNotifications = async (currentOffset: number = 0) => {
    try {
      const response = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${currentOffset}`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data: ApiResponse = await response.json();

      if (currentOffset === 0) {
        setNotifications(data.notifications);
      } else {
        setNotifications((prev) => [...prev, ...data.notifications]);
      }

      setHasMore(data.hasMore);
      setOffset(data.nextOffset);
    } catch (err) {
      setError('Failed to load notifications');
      console.error('Notification fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    markAllRead();
    fetchNotifications(0);
  }, []);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    fetchNotifications(offset);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
        You’re all caught up. New activity will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} />
      ))}

      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
