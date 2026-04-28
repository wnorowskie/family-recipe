'use client';

import { useState } from 'react';
import TimelineCard from './TimelineCard';
import EmptyState from './EmptyState';
import { TimelineItem } from '@/lib/timeline';
import { apiClient, ApiError } from '@/lib/apiClient';
import { API_ERROR_CODES } from '@/lib/apiErrors';

interface TimelinePage {
  items: TimelineItem[];
  hasMore: boolean;
  nextOffset: number;
}

interface TimelineFeedProps {
  initialItems: TimelineItem[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

export default function TimelineFeed({
  initialItems,
  initialHasMore,
  initialNextOffset,
}: TimelineFeedProps) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await apiClient.get<TimelinePage>('/api/timeline', {
        query: { limit: 20, offset },
      });
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setOffset(data.nextOffset);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === API_ERROR_CODES.UNAUTHORIZED) {
          setError('Your session has expired. Please log in again.');
        } else if (err.code === API_ERROR_CODES.RATE_LIMIT_EXCEEDED) {
          setError('Too many requests. Please wait a moment and try again.');
        } else {
          setError('Failed to load timeline');
        }
      } else {
        setError('Failed to load timeline');
      }
      console.error('Timeline fetch error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <TimelineCard key={item.id} item={item} />
      ))}

      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
