'use client';

import { useMemo, useState } from 'react';
import type { FeedbackListItem } from '@/lib/feedback';

import { apiClient, ApiError } from '@/lib/apiClient';

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
      const data = await apiClient.get<{
        items: FeedbackListItem[];
        page: { hasMore: boolean; nextOffset: number };
      }>(`/v1/feedback?${params.toString()}`);
      const nextItems: FeedbackListItem[] = data?.items ?? [];
      setItems((prev) =>
        options.append ? [...prev, ...nextItems] : nextItems
      );
      setHasMore(Boolean(data?.page?.hasMore));
      setNextOffset(Number(data?.page?.nextOffset ?? 0));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to load feedback'
      );
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
          <p className="text-xs uppercase tracking-wide text-[var(--fg-caption)]">
            Feedback
          </p>
          <h3 className="text-lg font-semibold text-[var(--fg-strong)]">
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
                    ? 'bg-[var(--fg-strong)] text-white border-[var(--border-active)]'
                    : 'border-[var(--border-card)] text-[var(--fg-body)] hover:border-[var(--border-input)]'
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
        <div className="rounded-2xl border border-[var(--bg-muted)] bg-white p-6 text-sm text-[var(--fg-meta)]">
          No feedback yet.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-[var(--bg-muted)] bg-white p-5 shadow-sm"
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
                <p className="text-xs text-[var(--fg-caption)]">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-xs text-[var(--fg-caption)]">
                {item.pageUrl ? (
                  <a
                    href={item.pageUrl}
                    className="text-[var(--fg-body)] underline-offset-2 hover:underline"
                  >
                    {item.pageUrl}
                  </a>
                ) : (
                  'Page unknown'
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-[var(--fg-strong)] whitespace-pre-line">
              {item.message}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-[var(--fg-meta)] sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-[var(--fg-caption)]">
                  Contact
                </p>
                <p>{item.contactEmail || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--fg-caption)]">
                  User
                </p>
                {item.userId ? (
                  <p>
                    {item.userName || 'User'} ({item.userEmail})
                  </p>
                ) : (
                  <p>Submitted while signed out</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--fg-caption)]">
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
            className="rounded-full border border-[var(--border-card)] px-4 py-2 text-sm font-semibold text-[var(--fg-body)] hover:bg-[var(--bg-page)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
