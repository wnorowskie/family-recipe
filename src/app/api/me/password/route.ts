import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { changePasswordSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logger';
import {
  parseRequestBody,
  notFoundError,
  invalidCredentialsError,
  internalError,
} from '@/lib/apiErrors';
import { clearSessionCookie } from '@/lib/session';

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json().catch(() => null);
    const validation = parseRequestBody(body, changePasswordSchema);
    if (!validation.success) return validation.error;
    const parsed = validation.data;

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!currentUser) {
      return notFoundError('User not found');
    }

    const matches = await verifyPassword(
      parsed.currentPassword,
      currentUser.passwordHash
    );

    if (!matches) {
      logWarn('profile.password.invalid_current', { userId: user.id });
      return invalidCredentialsError('Incorrect current password');
    }

    const newHash = await hashPassword(parsed.newPassword);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        passwordHash: newHash,
      },
    });

    const response = NextResponse.json({ status: 'updated' }, { status: 200 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    logError('profile.password.error', error, { userId: user.id });
    return internalError('Unable to update password');
  }
});
