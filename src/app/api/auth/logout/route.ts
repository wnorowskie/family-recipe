import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getCurrentUser } from '@/lib/session';
import { logError, logInfo } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const response = NextResponse.json(
      { message: 'Logged out successfully' },
      { status: 200 }
    );

    clearSessionCookie(response);
    logInfo('auth.logout', {
      userId: user?.id ?? null,
      familySpaceId: user?.familySpaceId ?? null,
    });

    return response;
  } catch (error) {
    logError('auth.logout.error', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to logout' } },
      { status: 500 }
    );
  }
}
