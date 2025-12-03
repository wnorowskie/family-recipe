import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from './session';

/**
 * Authenticated user context passed to API handlers
 */
export interface AuthenticatedUser {
  id: string;
  familySpaceId: string;
  role: string;
}

/**
 * Handler function that receives authenticated user context
 */
export type AuthenticatedHandler<T = any> = (
  request: NextRequest,
  user: AuthenticatedUser,
  context?: T
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps an API route handler to ensure the user is authenticated.
 * Returns 401 if not authenticated.
 *
 * @example
 * export const GET = withAuth(async (request, user) => {
 *   // user is guaranteed to exist
 *   return NextResponse.json({ userId: user.id });
 * });
 */
export function withAuth<T = any>(
  handler: AuthenticatedHandler<T>
): (request: NextRequest, context?: T) => Promise<NextResponse> {
  return async (request: NextRequest, context?: T) => {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        },
        { status: 401 }
      );
    }

    return handler(request, user, context);
  };
}

/**
 * Wraps an API route handler to ensure the user is authenticated
 * and has one of the required roles.
 * Returns 401 if not authenticated, 403 if insufficient permissions.
 *
 * @example
 * export const DELETE = withRole(['owner', 'admin'], async (request, user) => {
 *   // user is guaranteed to be owner or admin
 *   return NextResponse.json({ success: true });
 * });
 */
export function withRole<T = any>(
  allowedRoles: string | string[],
  handler: AuthenticatedHandler<T>
): (request: NextRequest, context?: T) => Promise<NextResponse> {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (request: NextRequest, context?: T) => {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        },
        { status: 401 }
      );
    }

    if (!roles.includes(user.role)) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
          },
        },
        { status: 403 }
      );
    }

    return handler(request, user, context);
  };
}
