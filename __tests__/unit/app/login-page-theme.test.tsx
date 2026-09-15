/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';
import { clearSession, getUser } from '@/lib/authStore';

// Regression for #324: after a successful login the page navigates with a
// client-side router.replace, so the server-rendered <html data-theme> from
// the /login SSR would otherwise persist. The success handler must apply the
// theme from the auth response before redirecting.

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// `@/lib/apiClient` transitively imports `next/server` (unavailable in
// jsdom). The page needs `ApiError`; `@/lib/authStore` wires the two
// registration hooks at import time, so they must exist as no-ops.
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
    setAccessTokenProvider: jest.fn(),
    setRefreshHooks: jest.fn(),
  };
});

function mockLoginResponse(theme: string) {
  const user = {
    id: 'cuser001',
    name: 'Claude Test',
    email: 'claude-test@example.com',
    username: 'claude-test',
    role: 'member',
    familySpaceId: 'cfam001',
    familySpaceName: 'Test Family',
    theme,
  };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ accessToken: 'access-token', user }),
  }) as unknown as typeof fetch;
  return user;
}

async function submitLogin() {
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText(/email or username/i), {
    target: { value: 'claude-test' },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: 'password' },
  });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
  await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/timeline'));
}

beforeEach(() => {
  replaceMock.mockReset();
  clearSession();
  document.documentElement.removeAttribute('data-theme');
});

describe('login page applies the persisted theme (#324)', () => {
  it('sets <html data-theme="warm"> before redirecting when the user prefers warm', async () => {
    const user = mockLoginResponse('warm');
    await submitLogin();

    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
    expect(getUser()).toEqual(user);
  });

  it('clears a stale data-theme when the user prefers grayscale', async () => {
    document.documentElement.setAttribute('data-theme', 'warm');
    mockLoginResponse('grayscale');
    await submitLogin();

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
