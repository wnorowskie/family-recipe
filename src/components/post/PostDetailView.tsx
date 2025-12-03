"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatRelativeTime } from '@/lib/timeline';
import type { PostDetailComment, PostDetailData } from '@/lib/posts';
import { formatIngredientUnit } from '@/lib/ingredients';

interface PostDetailViewProps {
  post: PostDetailData;
  canEdit: boolean;
  currentUser: {
    id: string;
    role: string;
  };
}

function formatDateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

const REACTION_EMOJIS = ['❤️', '👍', '🍳', '🍲', '🔥'];
const COMMENT_PAGE_SIZE = 20;
const COOKED_PAGE_SIZE = 5;
const COOKED_RATINGS = [1, 2, 3, 4, 5];

type RecipeIngredient = NonNullable<PostDetailData['recipe']>['ingredients'][number];

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return parseFloat(value.toFixed(2)).toString();
}

function formatIngredientLine(ingredient: RecipeIngredient): string {
  const parts: string[] = [];
  if (typeof ingredient.quantity === 'number') {
    parts.push(formatQuantity(ingredient.quantity));
  }

  const unitLabel =
    ingredient.unit === 'unitless'
      ? ''
      : formatIngredientUnit(ingredient.unit);

  if (unitLabel) {
    parts.push(unitLabel);
  }

  parts.push(ingredient.name);
  return parts.join(' ');
}

function formatTotalTime(minutes: number | null): string {
  if (!minutes || minutes <= 0) {
    return '—';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
  }

  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} min`);
  }

  return parts.join(' ');
}

function formatServings(servings: number | null): string {
  if (!servings || servings <= 0) {
    return '—';
  }

  return `${servings} ${servings === 1 ? 'person' : 'people'}`;
}

function formatReactionParticipants(users: Array<{ name: string }> = []): string {
  if (!users.length) {
    return '';
  }
  if (users.length === 1) {
    return users[0].name;
  }
  if (users.length === 2) {
    return `${users[0].name} and ${users[1].name}`;
  }
  return `${users[0].name}, ${users[1].name} +${users.length - 2}`;
}

export default function PostDetailView({ post, canEdit, currentUser }: PostDetailViewProps) {
  const createdDate = new Date(post.createdAt);
  const lastEditDate = post.lastEditAt ? new Date(post.lastEditAt) : null;
  const router = useRouter();
  const [comments, setComments] = useState<PostDetailComment[]>(post.comments);
  const [reactions, setReactions] = useState(post.reactionSummary);
  const [cookedStats, setCookedStats] = useState(post.cookedStats);
  const [recentCooked, setRecentCooked] = useState(post.recentCooked);
  const [cookedPagination, setCookedPagination] = useState(() =>
    post.recentCookedPage ?? {
      hasMore: false,
      nextOffset: post.recentCooked.length,
    }
  );
  const [isLoadingOlderCooked, setIsLoadingOlderCooked] = useState(false);
  const [olderCookedError, setOlderCookedError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentPhoto, setCommentPhoto] = useState<File | null>(null);
  const [commentPhotoPreview, setCommentPhotoPreview] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isReacting, setIsReacting] = useState(false);
  const [commentReactionTarget, setCommentReactionTarget] = useState<string | null>(null);
  const [deleteInFlight, setDeleteInFlight] = useState<string | null>(null);
  const [isCookedModalOpen, setIsCookedModalOpen] = useState(false);
  const [cookedRating, setCookedRating] = useState<number | null>(null);
  const [cookedNote, setCookedNote] = useState('');
  const [cookedError, setCookedError] = useState<string | null>(null);
  const [isSubmittingCooked, setIsSubmittingCooked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(post.isFavorited);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [commentPagination, setCommentPagination] = useState(() =>
    post.commentsPage ?? {
      hasMore: false,
      nextOffset: post.comments.length,
    }
  );
  const [isLoadingOlderComments, setIsLoadingOlderComments] = useState(false);
  const [olderCommentsError, setOlderCommentsError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (commentPhotoPreview) {
        URL.revokeObjectURL(commentPhotoPreview);
      }
    };
  }, [commentPhotoPreview]);

  const canDeleteComment = (commentAuthorId: string): boolean => {
    if (commentAuthorId === currentUser.id) {
      return true;
    }
    return currentUser.role === 'owner' || currentUser.role === 'admin';
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setCommentPhoto(null);
      setCommentPhotoPreview(null);
      return;
    }
    setCommentPhoto(file);
    setCommentPhotoPreview(URL.createObjectURL(file));
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentError('Comment cannot be empty');
      return;
    }

    try {
      setIsSubmittingComment(true);
      setCommentError(null);
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ text: trimmed }));
      if (commentPhoto) {
        formData.append('photo', commentPhoto);
      }

      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to add comment');
      }

      const data = await response.json();
      const nextComment = {
        ...data.comment,
        reactions: data.comment.reactions ?? [],
      } as PostDetailComment;
      setComments((prev) => {
        const updated = [...prev, nextComment];
        setCommentPagination((pagination) => ({
          ...pagination,
          nextOffset: updated.length,
        }));
        return updated;
      });
      setCommentText('');
      setCommentPhoto(null);
      if (commentPhotoPreview) {
        URL.revokeObjectURL(commentPhotoPreview);
      }
      setCommentPhotoPreview(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      setDeleteInFlight(commentId);
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Unable to delete comment');
      }

      setComments((prev) => {
        const updated = prev.filter((comment) => comment.id !== commentId);
        setCommentPagination((pagination) => ({
          ...pagination,
          nextOffset: updated.length,
        }));
        return updated;
      });
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Unable to delete comment');
    } finally {
      setDeleteInFlight(null);
    }
  };

  const handleLoadOlderComments = async () => {
    if (!commentPagination.hasMore || isLoadingOlderComments) {
      return;
    }

    try {
      setIsLoadingOlderComments(true);
      setOlderCommentsError(null);
      const params = new URLSearchParams();
      params.set('offset', String(commentPagination.nextOffset));
      params.set('limit', String(COMMENT_PAGE_SIZE));
      const response = await fetch(`/api/posts/${post.id}/comments?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to load comments');
      }

      const data: {
        comments: PostDetailComment[];
        hasMore: boolean;
        nextOffset: number;
      } = await response.json();

      setComments((prev) => {
        const merged = [...data.comments, ...prev];
        setCommentPagination({
          hasMore: data.hasMore,
          nextOffset: merged.length,
        });
        return merged;
      });
    } catch (error) {
      setOlderCommentsError(
        error instanceof Error ? error.message : 'Failed to load comments'
      );
    } finally {
      setIsLoadingOlderComments(false);
    }
  };

  const handleLoadOlderCooked = async () => {
    if (!cookedPagination.hasMore || isLoadingOlderCooked) {
      return;
    }

    try {
      setIsLoadingOlderCooked(true);
      setOlderCookedError(null);
      const params = new URLSearchParams();
      params.set('offset', String(cookedPagination.nextOffset));
      params.set('limit', String(COOKED_PAGE_SIZE));

      const response = await fetch(`/api/posts/${post.id}/cooked?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to load cooked history');
      }

      const data: {
        cookedEvents: PostDetailData['recentCooked'];
        hasMore: boolean;
        nextOffset: number;
      } = await response.json();

      setRecentCooked((prev) => {
        const existingIds = new Set(prev.map((entry) => entry.id));
        const merged = [...prev];
        data.cookedEvents.forEach((entry) => {
          if (!existingIds.has(entry.id)) {
            merged.push(entry);
          }
        });
        setCookedPagination({
          hasMore: data.hasMore,
          nextOffset: data.nextOffset,
        });
        return merged;
      });
    } catch (error) {
      setOlderCookedError(
        error instanceof Error ? error.message : 'Failed to load cooked history'
      );
    } finally {
      setIsLoadingOlderCooked(false);
    }
  };

  const handleReactionClick = async (emoji: string) => {
    try {
      setIsReacting(true);
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          targetType: 'post',
          targetId: post.id,
          emoji,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to react');
      }

      const data = await response.json();
      setReactions(data.reactions);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Failed to react');
    } finally {
      setIsReacting(false);
    }
  };

  const handleCommentReactionClick = async (commentId: string, emoji: string) => {
    try {
      setCommentReactionTarget(commentId);
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: commentId,
          emoji,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to react to comment');
      }

      const data = await response.json();
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, reactions: data.reactions }
            : comment
        )
      );
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Failed to react to comment');
    } finally {
      setCommentReactionTarget(null);
    }
  };

  const handleCookedSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsSubmittingCooked(true);
      setCookedError(null);

      const payload: Record<string, unknown> = {};
      if (cookedRating !== null) {
        payload.rating = cookedRating;
      }
      const trimmedNote = cookedNote.trim();
      if (trimmedNote) {
        payload.note = trimmedNote;
      }

      const response = await fetch(`/api/posts/${post.id}/cooked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to save cooked event');
      }

      const data: {
        cookedStats: PostDetailData['cookedStats'];
        recentCooked?: PostDetailData['recentCooked'];
        recentCookedPage?: { hasMore: boolean; nextOffset: number };
      } = await response.json();

      setCookedStats(data.cookedStats);
      if (data.recentCooked) {
        setRecentCooked(data.recentCooked);
      }
      if (data.recentCookedPage) {
        setCookedPagination(data.recentCookedPage);
      } else if (data.recentCooked) {
        const cookedCount = data.recentCooked.length;
        setCookedPagination({
          hasMore: data.cookedStats.timesCooked > cookedCount,
          nextOffset: cookedCount,
        });
      }
      setIsCookedModalOpen(false);
      setCookedRating(null);
      setCookedNote('');
    } catch (error) {
      setCookedError(error instanceof Error ? error.message : 'Failed to save cooked event');
    } finally {
      setIsSubmittingCooked(false);
    }
  };

  const handleFavoriteToggle = async () => {
    try {
      setIsFavoriteLoading(true);
      setFavoriteError(null);
      const method = isFavorited ? 'DELETE' : 'POST';
      const response = await fetch(`/api/posts/${post.id}/favorite`, {
        method,
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Unable to update favorite');
      }

      setIsFavorited((prev) => !prev);
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : 'Unable to update favorite');
    } finally {
      setIsFavoriteLoading(false);
    }
  };

  const closeCookedModal = () => {
    setIsCookedModalOpen(false);
    setCookedError(null);
    setCookedRating(null);
    setCookedNote('');
  };

  const handleDeletePost = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this post? This cannot be undone.'
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingPost(true);
      setDeleteError(null);
      const response = await fetch(`/api/posts/${post.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Unable to delete post');
      }

      router.replace('/timeline');
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete post');
    } finally {
      setIsDeletingPost(false);
    }
  };

  return (
    <article className="space-y-6">
      <header className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{post.title}</h1>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-lg font-semibold text-gray-700 overflow-hidden">
                {post.author.avatarUrl ? (
                  <Image
                    src={post.author.avatarUrl}
                    alt={post.author.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 object-cover"
                    unoptimized
                  />
                ) : (
                  <span>{post.author.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">{post.author.name}</span>
                  <span className="text-gray-500"> · {formatRelativeTime(createdDate)}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Posted on {formatDateTime(createdDate)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                aria-pressed={isFavorited}
                onClick={handleFavoriteToggle}
                disabled={isFavoriteLoading}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isFavorited
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isFavorited ? 'Saved to Favorites' : 'Save to Favorites'}
              </button>
              {canEdit && (
                <Link
                  href={`/posts/${post.id}/edit`}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Edit Post
                </Link>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleDeletePost}
                  disabled={isDeletingPost}
                  className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {isDeletingPost ? 'Deleting…' : 'Delete Post'}
                </button>
              )}
            </div>
            {favoriteError && (
              <p className="text-xs text-red-600">{favoriteError}</p>
            )}
            {deleteError && (
              <p className="text-xs text-red-600">{deleteError}</p>
            )}
          </div>
        </div>
        {post.caption && (
          <p className="text-lg text-gray-700 whitespace-pre-line">{post.caption}</p>
        )}
      </header>

      {post.photos.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="relative w-full h-72 rounded-2xl overflow-hidden">
            <Image
              src={post.photos[0].url}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              unoptimized
            />
          </div>
          {post.photos.length > 1 && (
            <div className="grid grid-cols-3 gap-3">
              {post.photos.slice(1).map((photo) => (
                <div key={photo.id} className="relative h-32 rounded-xl overflow-hidden">
                  <Image
                    src={photo.url}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 33vw, 200px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {post.recipe && (
        <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(post.recipe.courses.length > 0
              ? post.recipe.courses
              : post.recipe.primaryCourse
              ? [post.recipe.primaryCourse]
              : []
            ).map((course) => (
              <span
                key={course}
                className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700"
              >
                {course}
              </span>
            ))}
            {post.recipe.difficulty && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
                {post.recipe.difficulty} difficulty
              </span>
            )}
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700"
              >
                #{tag}
              </span>
            ))}
          </div>

          {post.recipe.origin && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-sm text-gray-500 mb-1">Family story</p>
              <p className="text-gray-800">{post.recipe.origin}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Total time</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatTotalTime(post.recipe.totalTime)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Servings</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatServings(post.recipe.servings)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Ingredients</h2>
              <div className="bg-gray-50 rounded-2xl p-4 text-gray-800">
                {post.recipe.ingredients.length > 0 ? (
                  <ul className="space-y-2 text-sm md:text-base">
                    {post.recipe.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}>{formatIngredientLine(ingredient)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No ingredients listed.</p>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Steps</h2>
              <div className="bg-gray-50 rounded-2xl p-4 text-gray-800">
                {post.recipe.steps.length > 0 ? (
                  <ol className="space-y-3 list-decimal list-inside text-sm md:text-base">
                    {post.recipe.steps.map((step, index) => (
                      <li key={`${step.text}-${index}`}>{step.text}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-gray-500">No steps listed.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap gap-4 justify-between">
          <div>
            <p className="text-sm text-gray-500">Cooked this</p>
            <p className="text-lg font-semibold text-gray-900">
              {cookedStats.timesCooked} times
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Average rating</p>
            <p className="text-lg font-semibold text-gray-900">
              {cookedStats.averageRating
                ? `${cookedStats.averageRating.toFixed(1)} / 5`
                : 'No ratings yet'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsCookedModalOpen(true)}
          className="w-full rounded-xl bg-gray-900 text-white py-3 font-semibold"
        >
          Cooked this!
        </button>

        {lastEditDate && (
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">
              Last updated {formatRelativeTime(lastEditDate)}
              {post.editor && (
                <>
                  {' '}
                  by <span className="font-semibold text-gray-900">{post.editor.name}</span>
                </>
              )}
            </p>
            {post.lastEditNote && (
              <p className="text-gray-800 mt-1">“{post.lastEditNote}”</p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Recent cooks</h2>
          <div className="flex items-center gap-3">
            {cookedStats.timesCooked > recentCooked.length && (
              <p className="text-sm text-gray-500">
                +{cookedStats.timesCooked - recentCooked.length} more logged
              </p>
            )}
            {cookedPagination.hasMore && (
              <button
                type="button"
                onClick={handleLoadOlderCooked}
                disabled={isLoadingOlderCooked}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60"
              >
                {isLoadingOlderCooked ? 'Loading…' : 'Load older cooks'}
              </button>
            )}
          </div>
        </div>
        {olderCookedError && <p className="text-sm text-red-600">{olderCookedError}</p>}
        {recentCooked.length > 0 ? (
          <div className="space-y-3">
            {recentCooked.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-gray-100 p-4 flex gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 overflow-hidden">
                  {entry.user.avatarUrl ? (
                    <Image
                      src={entry.user.avatarUrl}
                      alt={entry.user.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover"
                      unoptimized
                    />
                  ) : (
                    <span>{entry.user.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {entry.user.name}
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(new Date(entry.createdAt))}
                    </span>
                    {typeof entry.rating === 'number' && (
                      <span className="ml-auto text-sm font-semibold text-gray-900">
                        {entry.rating} ★
                      </span>
                    )}
                  </div>
                  {entry.note && (
                    <p className="mt-2 text-gray-800 whitespace-pre-line">{entry.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No one has logged this yet — be the first to cook it!
          </p>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900">Reactions</h2>
          <div className="flex flex-wrap gap-2">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={isReacting}
                onClick={() => handleReactionClick(emoji)}
                className="rounded-full border border-gray-200 px-3 py-1 text-lg hover:bg-gray-50 disabled:opacity-40"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {reactions.length > 0 ? (
            reactions.map((reaction) => {
              const participantLabel = formatReactionParticipants(reaction.users);
              return (
                <div key={reaction.emoji} className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
                    <span>{reaction.emoji}</span>
                    <span>{reaction.count}</span>
                  </span>
                  {participantLabel && (
                    <span className="text-xs text-gray-500">
                      {participantLabel}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-gray-500">No reactions yet</p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Comments</h2>
        {commentPagination.hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadOlderComments}
              disabled={isLoadingOlderComments}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60"
            >
              {isLoadingOlderComments ? 'Loading…' : 'Load older comments'}
            </button>
          </div>
        )}
        {olderCommentsError && (
          <p className="text-sm text-red-600">{olderCommentsError}</p>
        )}
        <div className="space-y-4">
          {comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 overflow-hidden">
                  {comment.author.avatarUrl ? (
                    <Image
                      src={comment.author.avatarUrl}
                      alt={comment.author.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover"
                      unoptimized
                    />
                  ) : (
                    <span>{comment.author.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {comment.author.name}
                    </p>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(new Date(comment.createdAt))}
                    </span>
                    {canDeleteComment(comment.author.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={deleteInFlight === comment.id}
                        className="ml-auto text-xs text-gray-500 hover:text-red-600"
                      >
                        {deleteInFlight === comment.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                  <p className="text-gray-800 mt-2 whitespace-pre-line">
                    {comment.text}
                  </p>
                  {comment.photoUrl && (
                    <div className="relative h-40 w-full rounded-xl overflow-hidden mt-3">
                      <Image
                        src={comment.photoUrl}
                        alt="Comment attachment"
                        fill
                        sizes="(max-width: 768px) 100vw, 400px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleCommentReactionClick(comment.id, emoji)}
                          disabled={commentReactionTarget === comment.id}
                          className={`rounded-full border px-3 py-1 text-sm transition ${
                            commentReactionTarget === comment.id
                              ? 'border-gray-200 text-gray-400'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      {comment.reactions.length > 0 ? (
                        comment.reactions.map((reaction) => {
                          const participantLabel = formatReactionParticipants(reaction.users);
                          return (
                            <div key={reaction.emoji} className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                <span>{reaction.emoji}</span>
                                <span>{reaction.count}</span>
                              </span>
                              {participantLabel && (
                                <span className="text-[11px] text-gray-500">
                                  {participantLabel}
                                </span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-gray-400">No reactions yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No comments yet</p>
          )}
        </div>
        <form className="border-t border-gray-100 pt-4 space-y-4" onSubmit={handleCommentSubmit}>
          <div>
            <label className="text-sm font-semibold text-gray-700">Add a comment</label>
            <textarea
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Share your thoughts"
              rows={3}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-blue-600 cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              Add photo
            </label>
            {commentPhotoPreview && (
              <div className="relative h-16 w-16 rounded-lg overflow-hidden border">
                <Image
                  src={commentPhotoPreview}
                  alt="Preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 bg-white rounded-full px-2 text-xs text-gray-700"
                  onClick={() => {
                    if (commentPhotoPreview) {
                      URL.revokeObjectURL(commentPhotoPreview);
                    }
                    setCommentPhoto(null);
                    setCommentPhotoPreview(null);
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
          {commentError && (
            <p className="text-sm text-red-600">{commentError}</p>
          )}
          <button
            type="submit"
            disabled={isSubmittingComment}
            className="w-full rounded-xl bg-gray-900 text-white py-3 font-semibold disabled:opacity-50"
          >
            {isSubmittingComment ? 'Posting…' : 'Post Comment'}
          </button>
        </form>
      </section>

      {isCookedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Cooked this!</p>
                <h3 className="text-xl font-semibold text-gray-900">Tell the family how it went</h3>
              </div>
              <button
                type="button"
                onClick={closeCookedModal}
                className="text-gray-500 hover:text-gray-900"
              >
                ×
              </button>
            </div>
            <form className="mt-6 space-y-6" onSubmit={handleCookedSubmit}>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-3">Rating (optional)</p>
                <div className="flex gap-2">
                  {COOKED_RATINGS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setCookedRating((prev) => (prev === rating ? null : rating))}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        cookedRating === rating
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {rating} ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-900" htmlFor="cooked-note">
                  Notes (optional)
                </label>
                <textarea
                  id="cooked-note"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  rows={4}
                  placeholder="Share any tips, tweaks, or how it turned out"
                  value={cookedNote}
                  onChange={(event) => setCookedNote(event.target.value)}
                />
              </div>
              {cookedError && <p className="text-sm text-red-600">{cookedError}</p>}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCookedModal}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCooked}
                  className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                >
                  {isSubmittingCooked ? 'Saving…' : 'Save cooked event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}
