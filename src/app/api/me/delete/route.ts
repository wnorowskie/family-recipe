import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { deleteAccountSchema } from '@/lib/validation';
import { verifyPassword } from '@/lib/auth';
import { clearSessionCookie } from '@/lib/session';
import { logError, logWarn } from '@/lib/logger';
import {
  forbiddenError,
  invalidCredentialsError,
  internalError,
  notFoundError,
  parseRequestBody,
} from '@/lib/apiErrors';

export const DELETE = withAuth(async (request, user) => {
  try {
    if (user.role === 'owner' || user.role === 'admin') {
      return forbiddenError('Owners and admins cannot delete their accounts');
    }

    const body = await request.json().catch(() => null);
    const parsed = parseRequestBody(body, deleteAccountSchema);
    if (!parsed.success) return parsed.error;

    const { currentPassword, confirmation } = parsed.data;

    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });

    if (!currentUser) {
      return notFoundError('User not found');
    }

    const matches = await verifyPassword(
      currentPassword,
      currentUser.passwordHash
    );

    if (!matches) {
      logWarn('account.delete.invalid_password', { userId: user.id });
      return invalidCredentialsError('Incorrect password');
    }

    await prisma.user.delete({
      where: { id: user.id },
    });

    const response = NextResponse.json({ status: 'deleted' }, { status: 200 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    logError('account.delete.error', error, { userId: user.id });
    return internalError('Unable to delete account');
  }
});
