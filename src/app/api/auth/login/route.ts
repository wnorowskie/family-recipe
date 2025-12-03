import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { signToken } from '@/lib/jwt';
import { setSessionCookie } from '@/lib/session';
import { logError, logInfo, logWarn } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { emailOrUsername, password, rememberMe } = body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { emailOrUsername },
      include: {
        memberships: {
          include: {
            familySpace: true,
          },
        },
      },
    });

    if (!user) {
      logWarn('auth.login.invalid_credentials', { emailOrUsername, reason: 'user_not_found' });
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email/username or password',
          },
        },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      logWarn('auth.login.invalid_credentials', { emailOrUsername, reason: 'bad_password' });
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email/username or password',
          },
        },
        { status: 401 }
      );
    }

    // Check if user has a family membership
    if (user.memberships.length === 0) {
      logWarn('auth.login.no_membership', { emailOrUsername, userId: user.id });
      return NextResponse.json(
        {
          error: {
            code: 'NO_MEMBERSHIP',
            message: 'User is not a member of any family space',
          },
        },
        { status: 403 }
      );
    }

    const membership = user.memberships[0];

    // Generate JWT
    const token = await signToken(
      {
        userId: user.id,
        familySpaceId: membership.familySpaceId,
        role: membership.role,
      },
      rememberMe
    );

    logInfo('auth.login.success', {
      userId: user.id,
      familySpaceId: membership.familySpaceId,
      role: membership.role,
      emailOrUsername: user.emailOrUsername,
    });

    // Create response with session cookie
    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          emailOrUsername: user.emailOrUsername,
          avatarUrl: user.avatarUrl,
          role: membership.role,
          familySpaceId: membership.familySpaceId,
          familySpaceName: membership.familySpace.name,
        },
      },
      { status: 200 }
    );

    setSessionCookie(response, token, rememberMe);

    return response;
  } catch (error) {
    logError('auth.login.error', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}
