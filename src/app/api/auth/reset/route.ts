import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { resetPasswordSchema } from '@/lib/validation';
import { getEnvMasterKeyHash } from '@/lib/masterKey';
import { clearSessionCookie } from '@/lib/session';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { loginLimiter, applyRateLimit } from '@/lib/rateLimit';
import {
  parseRequestBody,
  invalidCredentialsError,
  internalError,
} from '@/lib/apiErrors';

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = applyRateLimit(
      loginLimiter,
      loginLimiter.getIPKey(request)
    );
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const parsed = parseRequestBody(body, resetPasswordSchema);
    if (!parsed.success) return parsed.error;

    const { email, masterKey, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      include: {
        memberships: true,
      },
    });

    if (!user) {
      logWarn('auth.reset.invalid', { email, reason: 'user_not_found' });
      return invalidCredentialsError('Invalid email or master key');
    }

    const masterKeyHash = await getEnvMasterKeyHash();
    const isValidKey = await verifyPassword(masterKey, masterKeyHash);

    if (!isValidKey) {
      logWarn('auth.reset.invalid', { email, reason: 'bad_master_key' });
      return invalidCredentialsError('Invalid email or master key');
    }

    const newHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    const response = NextResponse.json({ status: 'reset' }, { status: 200 });
    clearSessionCookie(response);

    logInfo('auth.reset.success', { userId: user.id, email: user.email });

    return response;
  } catch (error) {
    logError('auth.reset.error', error);
    return internalError('Unable to reset password');
  }
}
