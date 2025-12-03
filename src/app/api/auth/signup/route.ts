import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { signupSchema } from '@/lib/validation';
import { signToken } from '@/lib/jwt';
import { setSessionCookie } from '@/lib/session';
import { logError, logInfo, logWarn } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = signupSchema.safeParse(body);
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

    const { name, emailOrUsername, password, familyMasterKey, rememberMe } =
      validationResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { emailOrUsername },
    });

    if (existingUser) {
      logWarn('auth.signup.user_exists', { emailOrUsername });
      return NextResponse.json(
        {
          error: {
            code: 'USER_EXISTS',
            message: 'A user with this email or username already exists',
          },
        },
        { status: 400 }
      );
    }

    // Get the family space (V1: assume single family space)
    const familySpace = await prisma.familySpace.findFirst();

    if (!familySpace) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_FAMILY_SPACE',
            message: 'No family space found. Please contact the administrator.',
          },
        },
        { status: 500 }
      );
    }

    // Verify the family master key
    const isValidKey = await verifyPassword(
      familyMasterKey,
      familySpace.masterKeyHash
    );

    if (!isValidKey) {
      logWarn('auth.signup.invalid_master_key', { emailOrUsername });
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_MASTER_KEY',
            message: 'Invalid Family Master Key',
          },
        },
        { status: 400 }
      );
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
