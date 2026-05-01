'use client';

import { useEffect, useState } from 'react';
import NotificationCard from './NotificationCard';
import { apiClient } from '@/lib/apiClient';
import { isFastApiAuthEnabled } from '@/lib/featureFlags';

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

interface NotificationsFeedProps {
  initialNotifications: NotificationResponseItem[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

const PAGE_SIZE = 20;

export default function NotificationsFeed({
  initialNotifications,
  initialHasMore,
  initialNextOffset,
}: NotificationsFeedProps) {
  const [notifications, setNotifications] =
    useState<NotificationResponseItem[]>(initialNotifications);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fire-and-forget: mark notifications read once the feed has been opened.
    // No state is set in this effect body; the bell refreshes via its own poll.
    const markRead = async () => {
      try {
        if (isFastApiAuthEnabled()) {
          await apiClient.post('/v1/notifications/mark-read', { body: {} });
          return;
        }
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (err) {
        console.error('Failed to mark notifications as read', err);
      }
    };
    markRead();
  }, []);

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      let data: ApiResponse;
      if (isFastApiAuthEnabled()) {
        data = await apiClient.get<ApiResponse>('/v1/notifications', {
          query: { limit: PAGE_SIZE, offset },
        });
      } else {
        const response = await fetch(
          `/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`,
          { cache: 'no-store' }
        );
        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }
        data = (await response.json()) as ApiResponse;
      }
      setNotifications((prev) => [...prev, ...data.notifications]);
      setHasMore(data.hasMore);
      setOffset(data.nextOffset);
    } catch (err) {
      setError('Failed to load notifications');
      console.error('Notification fetch error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

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
