import { API_ERROR_CODES, type ApiErrorCode } from '@/lib/apiErrors';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

type AccessTokenProvider = () => string | null | undefined;

let accessTokenProvider: AccessTokenProvider = () => null;

export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export function clearAccessTokenProvider(): void {
  accessTokenProvider = () => null;
}

// Phase 2 refresh-and-retry hooks. The auth store registers these at module
// load (avoids an apiClient ↔ authStore import cycle). When unset, the retry
// loop is a no-op and 401s propagate as before.
interface RefreshHooks {
  onRefreshed: (accessToken: string) => void;
  onRefreshFailed: () => void;
}

let refreshHooks: RefreshHooks | null = null;

export function setRefreshHooks(hooks: RefreshHooks): void {
  refreshHooks = hooks;
}

export function clearRefreshHooks(): void {
  refreshHooks = null;
}

const REFRESH_PATH = '/v1/auth/refresh';
const AUTH_BYPASS_PATHS = new Set([
  REFRESH_PATH,
  '/v1/auth/login',
  '/v1/auth/signup',
  '/v1/auth/logout',
]);

function isAuthEndpoint(path: string): boolean {
  // Match exact path or path with query string; ignore base URL prefix.
  const withoutQuery = path.split('?')[0];
  for (const bypass of AUTH_BYPASS_PATHS) {
    if (withoutQuery === bypass || withoutQuery.endsWith(bypass)) return true;
  }
  return false;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  const parts = document.cookie ? document.cookie.split(';') : [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

let inflightRefresh: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (typeof document === 'undefined') {
    throw new Error('apiClient.tryRefresh must not run on the server');
  }
  if (inflightRefresh) return inflightRefresh;

  const csrf = readCookie('csrf_token');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = csrf;

  inflightRefresh = (async () => {
    try {
      const response = await fetch(buildUrl(REFRESH_PATH), {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        refreshHooks?.onRefreshFailed();
        return false;
      }
      const body = (await response.json()) as { accessToken?: unknown };
      if (
        typeof body.accessToken !== 'string' ||
        body.accessToken.length === 0
      ) {
        refreshHooks?.onRefreshFailed();
        return false;
      }
      refreshHooks?.onRefreshed(body.accessToken);
      return true;
    } catch {
      refreshHooks?.onRefreshFailed();
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

// `NEXT_PUBLIC_*` is inlined by Next.js at build time for client bundles, not
// read at runtime. Flipping this in env config alone won't redirect requests in
// a deployed build — Phase 1 rollouts need a per-environment build (or a
// runtime config endpoint).
function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return '';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function buildUrl(path: string): string {
  const base = getBaseUrl();
  if (!base) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: API_ERROR_CODES.VALIDATION_ERROR,
  401: API_ERROR_CODES.UNAUTHORIZED,
  403: API_ERROR_CODES.FORBIDDEN,
  404: API_ERROR_CODES.NOT_FOUND,
  409: API_ERROR_CODES.CONFLICT,
  429: API_ERROR_CODES.RATE_LIMIT_EXCEEDED,
};

const KNOWN_CODES = new Set<string>(Object.values(API_ERROR_CODES));

function fallbackCodeForStatus(status: number): ApiErrorCode {
  return (
    STATUS_TO_CODE[status] ??
    (status >= 500
      ? API_ERROR_CODES.INTERNAL_ERROR
      : API_ERROR_CODES.BAD_REQUEST)
  );
}

function fallbackMessageForStatus(status: number): string {
  return `Request failed with status ${status}`;
}

async function normalizeError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body — fall through to status-only mapping.
  }

  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    const err = (body as { error: { code?: unknown; message?: unknown } })
      .error;
    const code =
      typeof err.code === 'string' && KNOWN_CODES.has(err.code)
        ? (err.code as ApiErrorCode)
        : fallbackCodeForStatus(response.status);
    const message =
      typeof err.message === 'string' && err.message.length > 0
        ? err.message
        : fallbackMessageForStatus(response.status);
    return new ApiError(code, message, response.status);
  }

  return new ApiError(
    fallbackCodeForStatus(response.status),
    fallbackMessageForStatus(response.status),
    response.status
  );
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  credentials?: RequestCredentials;
}

function appendQuery(path: string, query: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return path;
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`;
}

async function executeRequest(
  method: string,
  path: string,
  options: RequestOptions
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      if (!('Content-Type' in headers) && !('content-type' in headers)) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  // Read the access token fresh on every request so a retry after refresh
  // picks up the rotated token.
  const token = accessTokenProvider();
  if (token && !('Authorization' in headers) && !('authorization' in headers)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = buildUrl(appendQuery(path, options.query));
  return fetch(url, {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: options.credentials ?? 'include',
  });
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  let response = await executeRequest(method, path, options);

  // On 401, attempt a single refresh and retry the original request once.
  // Skip auth endpoints to avoid recursion (refresh failures must surface
  // as 401s, not trigger another refresh).
  if (
    response.status === 401 &&
    refreshHooks !== null &&
    !isAuthEndpoint(path)
  ) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await executeRequest(method, path, options);
    }
  }

  if (!response.ok) {
    throw await normalizeError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return undefined as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) =>
    request<T>('POST', path, options),
  patch: <T>(path: string, options?: RequestOptions) =>
    request<T>('PATCH', path, options),
  put: <T>(path: string, options?: RequestOptions) =>
    request<T>('PUT', path, options),
  del: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
};
