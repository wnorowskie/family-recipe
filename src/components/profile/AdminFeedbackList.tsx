'use client';

import { useMemo, useState } from 'react';
import type { FeedbackListItem } from '@/lib/feedback';

interface AdminFeedbackListProps {
  initialItems: FeedbackListItem[];
  initialHasMore: boolean;
  initialNextOffset: number;
}

type CategoryFilter = 'all' | 'bug' | 'suggestion';

export default function AdminFeedbackList({
  initialItems,
  initialHasMore,
  initialNextOffset,
}: AdminFeedbackListProps) {
  const [items, setItems] = useState<FeedbackListItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const categoryLabel = useMemo(() => {
    if (category === 'bug') return 'Bugs';
    if (category === 'suggestion') return 'Suggestions';
    return 'All feedback';
  }, [category]);

  async function loadPage(options: { append: boolean; offset?: number }) {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (options.offset !== undefined) {
        params.set('offset', options.offset.toString());
      }
      if (category !== 'all') {
        params.set('category', category);
      }
      const response = await fetch(`/api/feedback?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Unable to load feedback');
      }
      const nextItems: FeedbackListItem[] = data?.items ?? [];
      setItems((prev) =>
        options.append ? [...prev, ...nextItems] : nextItems
      );
      setHasMore(Boolean(data?.page?.hasMore));
      setNextOffset(Number(data?.page?.nextOffset ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load feedback');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(next: CategoryFilter) {
    if (next === category) return;
    setCategory(next);
    loadPage({ append: false, offset: 0 });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Feedback
          </p>
          <h3 className="text-lg font-semibold text-gray-900">
            {categoryLabel}
          </h3>
        </div>
        <div className="flex gap-2">
          {(['all', 'bug', 'suggestion'] as CategoryFilter[]).map((option) => {
            const active = option === category;
            const label =
              option === 'all'
                ? 'All'
                : option === 'bug'
                  ? 'Bugs'
                  : 'Suggestions';
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleFilterChange(option)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.length === 0 && !loading && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
          No feedback yet.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    item.category === 'bug'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {item.category === 'bug' ? 'Bug' : 'Suggestion'}
                </span>
                <p className="text-xs text-gray-500">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-xs text-gray-500">
                {item.pageUrl ? (
                  <a
                    href={item.pageUrl}
                    className="text-gray-700 underline-offset-2 hover:underline"
                  >
                    {item.pageUrl}
                  </a>
                ) : (
                  'Page unknown'
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-900 whitespace-pre-line">
              {item.message}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-gray-500">Contact</p>
                <p>{item.contactEmail || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">User</p>
                {item.userId ? (
                  <p>
                    {item.userName || 'User'} ({item.userEmail})
                  </p>
                ) : (
                  <p>Submitted while signed out</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500">
                  User agent
                </p>
                <p className="break-words">{item.userAgent || 'Unknown'}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadPage({ append: true, offset: nextOffset })}
            disabled={loading}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
