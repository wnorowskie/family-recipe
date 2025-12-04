import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getUserFavorites } from '@/lib/profile';
import { logError } from '@/lib/logger';
import { parseQueryParams, internalError } from '@/lib/apiErrors';
import { paginationSchema } from '@/lib/validation';

export const GET = withAuth(async (request, user) => {
  try {
    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryValidation = parseQueryParams(searchParams, paginationSchema);
    
    if (!queryValidation.success) {
      return queryValidation.error;
    }
    
    const { limit, offset } = queryValidation.data;

    const result = await getUserFavorites(user.id, user.familySpaceId, {
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('favorites.list.error', error, { userId: user.id });
    return internalError('Unable to load favorites');
  }
});
