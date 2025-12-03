'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type {
  ProfilePostListItem,
  ProfileCookedItem,
  ProfileFavoriteItem,
} from '@/lib/profile';

const PAGE_SIZE = 10;

type TabKey = 'posts' | 'cooked' | 'favorites';

interface PaginatedState<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number;
}

interface ProfileTabsProps {
  initialPosts: PaginatedState<ProfilePostListItem>;
  initialCooked: PaginatedState<ProfileCookedItem>;
  initialFavorites: PaginatedState<ProfileFavoriteItem>;
}

export default function ProfileTabs({
  initialPosts,
  initialCooked,
  initialFavorites,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('posts');
  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [postsState, setPostsState] = useState<PaginatedState<ProfilePostListItem>>(initialPosts);
  const [cookedState, setCookedState] = useState<PaginatedState<ProfileCookedItem>>(initialCooked);
  const [favoritesState, setFavoritesState] = useState<PaginatedState<ProfileFavoriteItem>>(initialFavorites);

  const tabConfig: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'posts', label: 'My Posts', count: postsState.items.length },
    { key: 'cooked', label: 'Cooked', count: cookedState.items.length },
    { key: 'favorites', label: 'Favorites', count: favoritesState.items.length },
  ];

  const handleLoadMore = async (tab: TabKey) => {
    setError(null);
    setLoadingTab(tab);

    try {
      let url = '';
      if (tab === 'posts') {
        url = `/api/profile/posts?limit=${PAGE_SIZE}&offset=${postsState.nextOffset}`;
      } else if (tab === 'cooked') {
        url = `/api/profile/cooked?limit=${PAGE_SIZE}&offset=${cookedState.nextOffset}`;
      } else {
        url = `/api/me/favorites?limit=${PAGE_SIZE}&offset=${favoritesState.nextOffset}`;
      }

      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const data = await response.json();

      if (tab === 'posts') {
        setPostsState((prev) => ({
          items: [...prev.items, ...data.items],
          hasMore: data.hasMore,
          nextOffset: data.nextOffset,
        }));
      } else if (tab === 'cooked') {
        setCookedState((prev) => ({
          items: [...prev.items, ...data.items],
          hasMore: data.hasMore,
          nextOffset: data.nextOffset,
        }));
      } else {
        setFavoritesState((prev) => ({
          items: [...prev.items, ...data.items],
          hasMore: data.hasMore,
          nextOffset: data.nextOffset,
        }));
      }
    } catch (err) {
      console.error('Profile load more error:', err);
      setError('Unable to load more right now. Try again soon.');
    } finally {
      setLoadingTab(null);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'posts':
        return (
          <div className="space-y-3">
            {postsState.items.length === 0 ? (
              <EmptyNotice message="No posts yet. Share your latest dish!" />
            ) : (
              postsState.items.map((post) => <PostCard key={post.id} post={post} />)
            )}
            {postsState.hasMore && (
              <LoadMoreButton
                onClick={() => handleLoadMore('posts')}
                loading={loadingTab === 'posts'}
              />
            )}
          </div>
        );
      case 'cooked':
        return (
          <div className="space-y-3">
            {cookedState.items.length === 0 ? (
              <EmptyNotice message="Nothing cooked yet. Log your next kitchen win!" />
            ) : (
              cookedState.items.map((entry) => <CookedCard key={entry.id} entry={entry} />)
            )}
            {cookedState.hasMore && (
              <LoadMoreButton
                onClick={() => handleLoadMore('cooked')}
                loading={loadingTab === 'cooked'}
              />
            )}
          </div>
        );
      case 'favorites':
      default:
        return (
          <div className="space-y-3">
            {favoritesState.items.length === 0 ? (
              <EmptyNotice message="No favorites yet. Make sure to save recipes you love." />
            ) : (
              favoritesState.items.map((favorite) => (
                <FavoriteCard key={favorite.id} favorite={favorite} />
              ))
            )}
            {favoritesState.hasMore && (
              <LoadMoreButton
                onClick={() => handleLoadMore('favorites')}
                loading={loadingTab === 'favorites'}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex rounded-full border border-gray-200 bg-white p-1 text-sm font-medium text-gray-500">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-full px-3 py-2 transition ${
              activeTab === tab.key
                ? 'bg-gray-900 text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
            <span className="ml-1 text-xs text-gray-400">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      {renderContent()}
    </div>
  );
}

function EmptyNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

function PostCard({ post }: { post: ProfilePostListItem }) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-gray-200 hover:shadow-md transition"
    >
      <Thumbnail imageUrl={post.mainPhotoUrl} title={post.title} />
      <div className="flex-1 min-w-0">
        <h3 className="truncate font-semibold text-gray-900">{post.title}</h3>
        <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
      </div>
      <div className="text-right text-xs text-gray-500">
        <p className="font-semibold text-gray-900">{post.cookedStats.timesCooked}</p>
        <p>Cooked</p>
        {post.cookedStats.averageRating !== null && (
          <p className="mt-1 text-gray-700">
            ⭐ {post.cookedStats.averageRating.toFixed(1)}
          </p>
        )}
      </div>
    </Link>
  );
}

function CookedCard({ entry }: { entry: ProfileCookedItem }) {
  return (
    <Link
      href={`/posts/${entry.post.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-gray-200 hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <Thumbnail imageUrl={entry.post.mainPhotoUrl} title={entry.post.title} />
        <div className="flex-1 min-w-0">
          <h3 className="truncate font-semibold text-gray-900">{entry.post.title}</h3>
          <p className="text-xs text-gray-500">{formatDate(entry.createdAt)}</p>
        </div>
        {typeof entry.rating === 'number' && entry.rating !== null && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            {entry.rating} ★
          </span>
        )}
      </div>
      {entry.note && (
        <p className="mt-3 text-sm text-gray-600">“{entry.note}”</p>
      )}
    </Link>
  );
}

function FavoriteCard({ favorite }: { favorite: ProfileFavoriteItem }) {
  return (
    <Link
      href={`/posts/${favorite.post.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-gray-200 hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <Thumbnail imageUrl={favorite.post.mainPhotoUrl} title={favorite.post.title} />
        <div className="flex-1 min-w-0">
          <h3 className="truncate font-semibold text-gray-900">{favorite.post.title}</h3>
          <p className="text-xs text-gray-500">By {favorite.post.authorName}</p>
        </div>
        <span className="text-sm text-gray-400">♥</span>
      </div>
      <p className="mt-2 text-xs text-gray-500">Saved {formatDate(favorite.createdAt)}</p>
    </Link>
  );
}

function Thumbnail({ imageUrl, title }: { imageUrl: string | null; title: string }) {
  if (!imageUrl) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
        🥘
      </div>
    );
  }

  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-xl">
      <Image
        src={imageUrl}
        alt={title}
        fill
        sizes="56px"
        className="object-cover"
        unoptimized
      />
    </div>
  );
}

function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="pt-4 text-center">
      <button
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Load More'}
      </button>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
