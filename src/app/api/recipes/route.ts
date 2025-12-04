import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getRecipes } from '@/lib/recipes';
import { logError } from '@/lib/logger';
import { parseQueryParams, internalError } from '@/lib/apiErrors';
import { recipeFiltersSchema } from '@/lib/validation';

export const GET = withAuth(async (request, user) => {
  try {
    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryValidation = parseQueryParams(searchParams, recipeFiltersSchema);
    
    if (!queryValidation.success) {
      return queryValidation.error;
    }
    
    const {
      limit = 20, // Default provided by schema, but TS needs this for type narrowing
      offset = 0, // Default provided by schema, but TS needs this for type narrowing
      search,
      course: courses,
      tags,
      difficulty: difficulties,
      authorId: authorIds,
      totalTimeMin: minTotalMinutes,
      totalTimeMax: maxTotalMinutes,
      servingsMin: minServings,
      servingsMax: maxServings,
      ingredients,
      sort,
    } = queryValidation.data;

    const result = await getRecipes({
      familySpaceId: user.familySpaceId,
      limit,
      offset,
      search,
      courses,
      tags,
      difficulties,
      authorIds,
      minTotalMinutes,
      maxTotalMinutes,
      minServings,
      maxServings,
      ingredients,
      sort,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('recipes.list.error', error);
    return internalError();
  }
});
