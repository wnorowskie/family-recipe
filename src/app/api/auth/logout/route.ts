import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { clearSessionCookie } from '@/lib/session';
import { logError, logInfo } from '@/lib/logger';

export const POST = withAuth(async (request, user) => {
  try {
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    clearSessionCookie(response);
    logInfo('auth.logout', {
      userId: user.id,
      familySpaceId: user.familySpaceId,
    });

    return response;
  } catch (error) {
    logError('auth.logout.error', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to logout' } },
      { status: 500 }
    );
  }
});
