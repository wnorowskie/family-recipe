import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Standardized API error codes.
 * Provides consistent error handling across all API routes.
 */
export const API_ERROR_CODES = {
  // 400 - Bad Request errors
  VALIDATION_ERROR: 'VALIDATION_ERROR', // Schema validation failures
  BAD_REQUEST: 'BAD_REQUEST', // General bad request

  // 401 - Unauthorized errors
  UNAUTHORIZED: 'UNAUTHORIZED', // Not authenticated
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS', // Wrong password/credentials

  // 403 - Forbidden errors
  FORBIDDEN: 'FORBIDDEN', // Authenticated but not authorized

  // 404 - Not Found errors
  NOT_FOUND: 'NOT_FOUND', // Resource doesn't exist

  // 409 - Conflict errors
  CONFLICT: 'CONFLICT', // Resource conflict (e.g., duplicate email)

  // 429 - Rate Limit errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED', // Rate limit hit

  // 500 - Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR', // Unexpected server error
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Standard error response structure
 */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  status: number
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Helper functions for common error responses
 */

export function validationError(
  message: string = 'Validation failed'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    API_ERROR_CODES.VALIDATION_ERROR,
    message,
    400
  );
}

export function badRequestError(
  message: string = 'Bad request'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.BAD_REQUEST, message, 400);
}

export function unauthorizedError(
  message: string = 'Not authenticated'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.UNAUTHORIZED, message, 401);
}

export function invalidCredentialsError(
  message: string = 'Invalid credentials'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    API_ERROR_CODES.INVALID_CREDENTIALS,
    message,
    401
  );
}

export function forbiddenError(
  message: string = 'Forbidden'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.FORBIDDEN, message, 403);
}

export function notFoundError(
  message: string = 'Resource not found'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.NOT_FOUND, message, 404);
}

export function conflictError(
  message: string = 'Resource conflict'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.CONFLICT, message, 409);
}

export function internalError(
  message: string = 'An unexpected error occurred'
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(API_ERROR_CODES.INTERNAL_ERROR, message, 500);
}

/**
 * Validation helper utilities
 */

/**
 * Parse and validate query parameters from URLSearchParams
 * Handles array parameters using repeated param pattern (?key=val1&key=val2)
 */
export function parseQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: NextResponse<ApiErrorResponse> } {
  // Build params object from URLSearchParams
  const params: Record<string, string | string[]> = {};
  
  // Track which keys have multiple values
  const multiValueKeys = new Set<string>();
  searchParams.forEach((_, key) => {
    if (searchParams.getAll(key).length > 1) {
      multiValueKeys.add(key);
    }
  });
  
  // Populate params object
  searchParams.forEach((value, key) => {
    if (multiValueKeys.has(key)) {
      params[key] = searchParams.getAll(key);
    } else {
      params[key] = value;
    }
  });
  
  const result = schema.safeParse(params);
  
  if (!result.success) {
    return {
      success: false,
      error: validationError(
        result.error.errors[0]?.message ?? 'Invalid query parameters'
      ),
    };
  }
  
  return { success: true, data: result.data };
}

/**
 * Validate route parameters (e.g., { postId: '...' })
 */
export function parseRouteParams<T>(
  params: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: NextResponse<ApiErrorResponse> } {
  const result = schema.safeParse(params);
  
  if (!result.success) {
    return {
      success: false,
      error: validationError(
        result.error.errors[0]?.message ?? 'Invalid route parameters'
      ),
    };
  }
  
  return { success: true, data: result.data };
}

/**
 * Validate request body
 */
export function parseRequestBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: NextResponse<ApiErrorResponse> } {
  const result = schema.safeParse(body);
  
  if (!result.success) {
    return {
      success: false,
      error: validationError(
        result.error.errors[0]?.message ?? 'Invalid request body'
      ),
    };
  }
  
  return { success: true, data: result.data };
}
