import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getRecipes } from '@/lib/recipes';
import { courseEnum } from '@/lib/validation';
import { logError } from '@/lib/logger';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;
const MAX_TIME_MINUTES = 12 * 60; // clamp cook-time filters to half-day max
const MAX_SERVINGS = 50;
const INGREDIENT_LIMIT = 5;
const DIFFICULTY_VALUES = new Set(['easy', 'medium', 'hard']);
type CourseValue = (typeof courseEnum.options)[number];
const COURSE_VALUES = new Set<CourseValue>(courseEnum.options);

function parseIntParam(
  value: string | null,
  bounds?: { min?: number; max?: number }
): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const intValue = Math.floor(parsed);
  if (bounds?.min !== undefined && intValue < bounds.min) {
    return bounds.min;
  }
  if (bounds?.max !== undefined && intValue > bounds.max) {
    return bounds.max;
  }
  return intValue;
}

function normalizeRange(
  min?: number,
  max?: number
): { min?: number; max?: number } {
  if (min !== undefined && max !== undefined && min > max) {
    return { min: max, max: min };
  }
  return { min, max };
}

export const GET = withAuth(async (request, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get('limit')) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
    const search = searchParams.get('search') ?? undefined;
    const rawCourseValues = searchParams
      .getAll('course')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const courses = Array.from(
      new Set(rawCourseValues.filter((value): value is CourseValue => COURSE_VALUES.has(value as CourseValue)))
    );
    const tags = searchParams.getAll('tags').filter((tag) => tag.length > 0);
    const difficulties = Array.from(
      new Set(
        searchParams
          .getAll('difficulty')
          .map((value) => value.trim())
          .filter((value) => DIFFICULTY_VALUES.has(value))
      )
    );
    const authorIds = Array.from(
      new Set(
        searchParams
          .getAll('authorId')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );

    const { min: minTotalMinutes, max: maxTotalMinutes } = normalizeRange(
      parseIntParam(searchParams.get('totalTimeMin'), { min: 0, max: MAX_TIME_MINUTES }),
      parseIntParam(searchParams.get('totalTimeMax'), { min: 0, max: MAX_TIME_MINUTES })
    );

    const { min: minServings, max: maxServings } = normalizeRange(
      parseIntParam(searchParams.get('servingsMin'), { min: 1, max: MAX_SERVINGS }),
      parseIntParam(searchParams.get('servingsMax'), { min: 1, max: MAX_SERVINGS })
    );

    const ingredients = searchParams
      .getAll('ingredients')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, INGREDIENT_LIMIT);

    const sortParam = (searchParams.get('sort') ?? 'recent').toLowerCase();
    const sort: 'recent' | 'alpha' = sortParam === 'alpha' ? 'alpha' : 'recent';

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
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
});
