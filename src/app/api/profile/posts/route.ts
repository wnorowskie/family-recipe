import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getUserPostsForProfile } from '@/lib/profile';
import { logError } from '@/lib/logger';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const GET = withAuth(async (request, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number(searchParams.get('limit'));
    const parsedOffset = Number(searchParams.get('offset'));
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    const result = await getUserPostsForProfile(user.id, user.familySpaceId, {
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('profile.posts.list.error', error, { userId: user.id });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to load posts',
        },
      },
      { status: 500 }
    );
  }
});
