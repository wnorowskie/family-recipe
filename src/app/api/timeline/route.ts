import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getTimelineFeed } from '@/lib/timeline-data';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        },
        { status: 401 }
      );
    }

    // Get pagination parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await getTimelineFeed({
      familySpaceId: user.familySpaceId,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('timeline.fetch.error', error);
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
