import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { signupSchema } from '@/lib/validation';
import { signToken } from '@/lib/jwt';
import { setSessionCookie } from '@/lib/session';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { signupLimiter, applyRateLimit } from '@/lib/rateLimit';
import {
  parseRequestBody,
  badRequestError,
  internalError,
} from '@/lib/apiErrors';
import { ensureFamilySpace, getEnvMasterKeyHash } from '@/lib/masterKey';

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (3 per IP per hour)
    const rateLimitResult = applyRateLimit(
      signupLimiter,
      signupLimiter.getIPKey(request)
    );
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Validate input
    const body = await request.json();
    const bodyValidation = parseRequestBody(body, signupSchema);

    if (!bodyValidation.success) {
      return bodyValidation.error;
    }

    const { name, emailOrUsername, password, familyMasterKey, rememberMe } =
      bodyValidation.data;

    // Load master key hash from env and ensure FamilySpace exists/synced
    const masterKeyHash = await getEnvMasterKeyHash();
    const familySpace = await ensureFamilySpace(masterKeyHash);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { emailOrUsername },
    });

    if (existingUser) {
      logWarn('auth.signup.user_exists', { emailOrUsername });
      return badRequestError(
        'A user with this email or username already exists'
      );
    }

    // Verify the family master key (env-driven)
    const isValidKey = await verifyPassword(familyMasterKey, masterKeyHash);

    if (!isValidKey) {
      logWarn('auth.signup.invalid_master_key', { emailOrUsername });
      return badRequestError('Invalid Family Master Key');
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Check if this is the first user (becomes owner)
    const existingMembersCount = await prisma.familyMembership.count({
      where: { familySpaceId: familySpace.id },
    });

    const role = existingMembersCount === 0 ? 'owner' : 'member';

    // Create user and membership in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          emailOrUsername,
          passwordHash,
        },
      });

      const membership = await tx.familyMembership.create({
        data: {
          familySpaceId: familySpace.id,
          userId: user.id,
          role,
        },
      });

      return { user, membership };
    });

    // Generate JWT
    const token = await signToken(
      {
        userId: result.user.id,
        familySpaceId: result.membership.familySpaceId,
        role: result.membership.role,
      },
      rememberMe
    );

    logInfo('auth.signup.success', {
      userId: result.user.id,
      familySpaceId: result.membership.familySpaceId,
      role: result.membership.role,
      emailOrUsername: result.user.emailOrUsername,
    });

    // Return user profile with session cookie
    const response = NextResponse.json(
      {
        user: {
          id: result.user.id,
          name: result.user.name,
          emailOrUsername: result.user.emailOrUsername,
          avatarUrl: result.user.avatarUrl,
          role: result.membership.role,
          familySpaceId: result.membership.familySpaceId,
        },
      },
      { status: 201 }
    );

    setSessionCookie(response, token, rememberMe);

    return response;
  } catch (error) {
    logError('auth.signup.error', error);
    return internalError();
  }
}
