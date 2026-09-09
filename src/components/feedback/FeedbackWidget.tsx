'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiClient, ApiError } from '@/lib/apiClient';

type Category = 'bug' | 'suggestion';

interface CurrentUser {
  id: string;
  email: string;
  username: string;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchUser() {
      try {
        const data = await apiClient.get<{ user: CurrentUser }>('/v1/auth/me');
        if (isActive && data?.user) {
          const nextUser: CurrentUser = {
            id: data.user.id,
            email: data.user.email,
            username: data.user.username,
          };
          setUser(nextUser);
          setEmail((prev) => prev || nextUser.email || '');
        }
      } catch {
        // Ignore – unauthenticated is expected on auth pages
      }
    }

    fetchUser();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const emailRequired = !user;

  function closeForm() {
    setOpen(false);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();

    if (!trimmedMessage || trimmedMessage.length < 10) {
      setError('Please add at least 10 characters so we can help.');
      return;
    }

    if (emailRequired && !trimmedEmail) {
      setError('Email is required when not signed in.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.post('/v1/feedback', {
        body: {
          category,
          message: trimmedMessage,
          email: trimmedEmail || undefined,
          pageUrl: pageUrl || undefined,
        },
      });
      setToast({ type: 'success', message: 'Thanks! We received your note.' });
      setMessage('');
      if (!user) {
        setEmail('');
      }
      setOpen(false);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Unable to send right now. Please try again in a moment.';
      setError(msg);
      setToast({ type: 'error', message: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Send feedback"
        onClick={() => {
          // This button is the only path that sets open=true. If another
          // opener is added (deep link, keyboard trigger, etc.), pageUrl
          // must be captured there too or it will be stale.
          if (typeof window !== 'undefined') {
            setPageUrl(window.location.href);
          }
          setOpen(true);
        }}
        className="fixed bottom-28 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--fg-strong)] text-white shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--border-active)] sm:bottom-6 sm:right-6"
      >
        ?
      </button>

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg text-sm font-medium text-white ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeForm}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-widget-title"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--fg-meta)]">
                  Help us improve
                </p>
                <h2
                  id="feedback-widget-title"
                  className="text-xl font-bold text-[var(--fg-strong)]"
                >
                  Send feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-[var(--fg-caption)] hover:text-[var(--fg-body)]"
                aria-label="Close feedback form"
              >
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="flex gap-2">
                {(['bug', 'suggestion'] as Category[]).map((option) => {
                  const active = category === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCategory(option)}
                      className={`flex-1 rounded-full border px-3 py-2 text-sm font-semibold capitalize transition ${
                        active
                          ? 'bg-[var(--fg-strong)] text-white border-[var(--border-active)]'
                          : 'border-[var(--border-card)] text-[var(--fg-body)] hover:border-[var(--border-input)]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--fg-body)]">
                  Your email {emailRequired ? '' : '(optional)'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border-input)] px-4 py-3 text-[var(--fg-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--border-active)]"
                  placeholder="you@example.com"
                  required={emailRequired}
                  inputMode="email"
                />
                <p className="text-xs text-[var(--fg-caption)]">
                  We&apos;ll reach out if we need more details. On auth pages,
                  email is required.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--fg-body)]">
                  What happened?
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="w-full rounded-xl border border-[var(--border-input)] px-4 py-3 text-[var(--fg-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--border-active)]"
                  rows={5}
                  placeholder="Describe the bug or share your suggestion"
                  required
                />
                <p className="text-xs text-[var(--fg-caption)]">
                  Include steps, device, and page if helpful. No attachments in
                  this version.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-[var(--fg-caption)]">
                <span className="flex-1 truncate pr-3">
                  {pageUrl || 'Page captured when you opened the form.'}
                </span>
                <span className="whitespace-nowrap">Limit: 10/hour</span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full border border-[var(--border-card)] px-4 py-2 text-sm font-semibold text-[var(--fg-body)] hover:bg-[var(--bg-page)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-[var(--fg-strong)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
