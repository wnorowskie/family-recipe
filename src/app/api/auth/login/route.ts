import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { signToken } from '@/lib/jwt';
import { setSessionCookie } from '@/lib/session';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { loginLimiter, applyRateLimit } from '@/lib/rateLimit';
import {
  parseRequestBody,
  invalidCredentialsError,
  forbiddenError,
  internalError,
} from '@/lib/apiErrors';
import { getSignedUploadUrl } from '@/lib/uploads';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (5 per IP per 15 minutes)
    const rateLimitResult = applyRateLimit(
      loginLimiter,
      loginLimiter.getIPKey(request)
    );
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Validate input
    const body = await request.json();
    const bodyValidation = parseRequestBody(body, loginSchema);

    if (!bodyValidation.success) {
      return bodyValidation.error;
    }

    const { emailOrUsername, password, rememberMe } = bodyValidation.data;

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
      logWarn('auth.login.invalid_credentials', {
        emailOrUsername,
        reason: 'user_not_found',
      });
      return invalidCredentialsError();
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      logWarn('auth.login.invalid_credentials', {
        emailOrUsername,
        reason: 'bad_password',
      });
      return invalidCredentialsError();
    }

    // Check if user has a family membership
    if (user.memberships.length === 0) {
      logWarn('auth.login.no_membership', { emailOrUsername, userId: user.id });
      return forbiddenError('User is not a member of any family space');
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
    const avatarUrl = await getSignedUploadUrl(user.avatarStorageKey);

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          emailOrUsername: user.emailOrUsername,
          avatarUrl,
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
    return internalError();
  }
}
