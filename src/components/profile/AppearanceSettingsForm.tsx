'use client';

import { useState } from 'react';

import { apiClient, ApiError } from '@/lib/apiClient';
import type { UpdateThemeInput } from '@/lib/validation';

type Theme = UpdateThemeInput['theme'];

interface AppearanceSettingsFormProps {
  theme: Theme;
}

const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
}> = [
  {
    value: 'grayscale',
    label: 'Grayscale',
    description: 'The default look.',
  },
  {
    value: 'warm',
    label: 'Warm & Cozy',
    description: 'A warmer palette for the timeline and recipes.',
  },
];

function applyThemeToDocument(theme: Theme) {
  if (theme === 'warm') {
    document.documentElement.setAttribute('data-theme', 'warm');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export default function AppearanceSettingsForm({
  theme: initialTheme,
}: AppearanceSettingsFormProps) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = async (next: Theme) => {
    if (next === theme || isSaving) return;

    const previous = theme;
    setError(null);
    setIsSaving(true);
    setTheme(next);
    applyThemeToDocument(next);

    try {
      await apiClient.patch('/v1/me/theme', { body: { theme: next } });
    } catch (err) {
      setTheme(previous);
      applyThemeToDocument(previous);
      setError(
        err instanceof ApiError ? err.message : 'Failed to update appearance'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[var(--bg-muted)] bg-white p-6 shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[var(--fg-strong)]">
          Appearance
        </h3>
        <p className="text-sm text-[var(--fg-caption)]">
          Choose the color palette for your timeline and recipes.
        </p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={isSaving}>
        <legend className="sr-only">Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 transition-colors ${
              theme === option.value
                ? 'border-[var(--border-active)] bg-[var(--bg-page)]'
                : 'border-[var(--border-input)]'
            } ${isSaving ? 'opacity-50' : ''}`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => handleSelect(option.value)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-[var(--fg-body)]">
                {option.label}
              </span>
            </span>
            <span className="text-xs text-[var(--fg-caption)]">
              {option.description}
            </span>
          </label>
        ))}
      </fieldset>

      {error && <p className="text-sm text-[var(--fg-destructive)]">{error}</p>}
    </div>
  );
}
