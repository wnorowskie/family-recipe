'use client';

import { FormEvent, useEffect, useState } from 'react';

type Category = 'bug' | 'suggestion';

interface CurrentUser {
  id: string;
  emailOrUsername: string;
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
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (isActive && data?.user) {
          const nextUser: CurrentUser = {
            id: data.user.id,
            emailOrUsername: data.user.emailOrUsername,
          };
          setUser(nextUser);
          setEmail((prev) => prev || nextUser.emailOrUsername || '');
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
    if (open && typeof window !== 'undefined') {
      setPageUrl(window.location.href);
    }
  }, [open]);

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
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category,
          message: trimmedMessage,
          email: trimmedEmail || undefined,
          pageUrl: pageUrl || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const msg =
          data?.error?.message || 'Something went wrong. Please try again.';
        setError(msg);
        setToast({ type: 'error', message: msg });
        return;
      }

      setToast({ type: 'success', message: 'Thanks! We received your note.' });
      setMessage('');
      if (!user) {
        setEmail('');
      }
      setOpen(false);
    } catch (err) {
      setToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Unable to send right now.',
      });
      setError('Unable to send right now. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Send feedback"
        onClick={() => setOpen(true)}
        className="fixed bottom-28 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 sm:bottom-6 sm:right-6"
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
                <p className="text-sm font-semibold text-gray-600">
                  Help us improve
                </p>
                <h2
                  id="feedback-widget-title"
                  className="text-xl font-bold text-gray-900"
                >
                  Send feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-gray-500 hover:text-gray-700"
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
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Your email {emailRequired ? '' : '(optional)'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="you@example.com"
                  required={emailRequired}
                  inputMode="email"
                />
                <p className="text-xs text-gray-500">
                  We&apos;ll reach out if we need more details. On auth pages,
                  email is required.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  What happened?
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  rows={5}
                  placeholder="Describe the bug or share your suggestion"
                  required
                />
                <p className="text-xs text-gray-500">
                  Include steps, device, and page if helpful. No attachments in
                  this version.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex-1 truncate pr-3">
                  {pageUrl || 'Page captured when you opened the form.'}
                </span>
                <span className="whitespace-nowrap">Limit: 10/hour</span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
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
