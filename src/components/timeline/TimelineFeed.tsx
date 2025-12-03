'use client';

import { useState, useEffect } from 'react';
import TimelineCard from './TimelineCard';
import EmptyState from './EmptyState';
import { TimelineItem } from '@/lib/timeline';

export default function TimelineFeed() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchTimeline = async (currentOffset: number = 0) => {
    try {
      const response = await fetch(
        `/api/timeline?limit=20&offset=${currentOffset}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch timeline');
      }

      const data = await response.json();

      if (currentOffset === 0) {
        setItems(data.items);
      } else {
        setItems((prev) => [...prev, ...data.items]);
      }

      setHasMore(data.hasMore);
      setOffset(data.nextOffset);
    } catch (err) {
      setError('Failed to load timeline');
      console.error('Timeline fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTimeline(0);
  }, []);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    fetchTimeline(offset);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }

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
