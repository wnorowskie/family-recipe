import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getTimelineFeed } from '@/lib/timeline-data';
import { logError } from '@/lib/logger';
import { parseQueryParams, internalError } from '@/lib/apiErrors';
import { timelineQuerySchema } from '@/lib/validation';

export const GET = withAuth(async (request, user) => {
  try {
    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryValidation = parseQueryParams(searchParams, timelineQuerySchema);
    
    if (!queryValidation.success) {
      return queryValidation.error;
    }
    
    const { limit, offset } = queryValidation.data;

    const result = await getTimelineFeed({
      familySpaceId: user.familySpaceId,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('timeline.fetch.error', error);
    return internalError();
  }
});
