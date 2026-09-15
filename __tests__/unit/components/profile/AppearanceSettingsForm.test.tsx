/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import AppearanceSettingsForm from '@/components/profile/AppearanceSettingsForm';
import { apiClient, ApiError } from '@/lib/apiClient';

// `@/lib/apiClient` transitively imports `@/lib/apiErrors`, which imports
// `next/server` — unavailable in jsdom. Mock the module wholesale (rather
// than `jest.requireActual`) with a self-contained `ApiError` so the
// component's `instanceof ApiError` check still works.
jest.mock('@/lib/apiClient', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    ApiError,
    apiClient: { patch: jest.fn() },
  };
});

const mockPatch = apiClient.patch as jest.Mock;

beforeEach(() => {
  mockPatch.mockReset();
  document.documentElement.removeAttribute('data-theme');
});

describe('AppearanceSettingsForm', () => {
  it('renders both options with the current theme selected', () => {
    render(<AppearanceSettingsForm theme="grayscale" />);

    const grayscale = screen.getByRole('radio', {
      name: /grayscale/i,
    }) as HTMLInputElement;
    const warm = screen.getByRole('radio', {
      name: /warm & cozy/i,
    }) as HTMLInputElement;
    expect(grayscale.checked).toBe(true);
    expect(warm.checked).toBe(false);
  });

  it('optimistically sets data-theme and PATCHes on selection', async () => {
    mockPatch.mockResolvedValue({ theme: 'warm' });
    render(<AppearanceSettingsForm theme="grayscale" />);

    fireEvent.click(screen.getByRole('radio', { name: /warm & cozy/i }));

    // Optimistic update happens synchronously, before the PATCH resolves.
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
    expect(mockPatch).toHaveBeenCalledWith('/v1/me/theme', {
      body: { theme: 'warm' },
    });

    await screen.findByRole('radio', { name: /warm & cozy/i, checked: true });
  });

  it('removes data-theme when switching back to grayscale', async () => {
    mockPatch.mockResolvedValue({ theme: 'grayscale' });
    render(<AppearanceSettingsForm theme="warm" />);
    document.documentElement.setAttribute('data-theme', 'warm');

    fireEvent.click(screen.getByRole('radio', { name: /grayscale/i }));

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    await screen.findByRole('radio', { name: /grayscale/i, checked: true });
  });

  it('rolls back the DOM and shows an error when the PATCH fails', async () => {
    mockPatch.mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'Failed to update theme', 500)
    );
    render(<AppearanceSettingsForm theme="grayscale" />);

    fireEvent.click(screen.getByRole('radio', { name: /warm & cozy/i }));

    expect(await screen.findByText('Failed to update theme')).not.toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    const grayscale = screen.getByRole('radio', {
      name: /grayscale/i,
    }) as HTMLInputElement;
    expect(grayscale.checked).toBe(true);
  });
});
