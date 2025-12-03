import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { changePasswordSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Missing request body' } },
        { status: 400 }
      );
    }

    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.errors[0]?.message ?? 'Invalid input',
          },
        },
        { status: 400 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    const matches = await verifyPassword(
      parsed.data.currentPassword,
      currentUser.passwordHash
    );

    if (!matches) {
      logWarn('profile.password.invalid_current', { userId: user.id });
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect current password' } },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(parsed.data.newPassword);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash: newHash,
      },
    });

    return NextResponse.json({ status: 'updated' }, { status: 200 });
  } catch (error) {
    logError('profile.password.error', error, { userId: user?.id });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to update password',
        },
      },
      { status: 500 }
    );
  }
}
