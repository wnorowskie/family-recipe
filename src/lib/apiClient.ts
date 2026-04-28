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

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
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

  // No-op until Phase 2 wires `setAccessTokenProvider` from the auth store.
  const token = accessTokenProvider();
  if (token && !('Authorization' in headers) && !('authorization' in headers)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = buildUrl(appendQuery(path, options.query));
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: options.credentials ?? 'include',
  });

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
