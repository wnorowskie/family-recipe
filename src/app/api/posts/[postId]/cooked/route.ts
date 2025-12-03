import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { cookedEventSchema } from '@/lib/validation';
import { getPostCookedEventsPage } from '@/lib/posts';
import { logError } from '@/lib/logger';

interface RouteContext {
  params: {
    postId: string;
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { postId } = context.params;
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    if (!postId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Post ID is required' } },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as unknown;

    const validationResult = cookedEventSchema.safeParse(body ?? {});

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: validationResult.error.errors[0]?.message ?? 'Invalid input',
          },
        },
        { status: 400 }
      );
    }

    const { rating, note } = validationResult.data;

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        familySpaceId: user.familySpaceId,
      },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found' } },
        { status: 404 }
      );
    }

    await prisma.cookedEvent.create({
      data: {
        postId: post.id,
        userId: user.id,
        rating: typeof rating === 'number' ? rating : null,
        note: note?.trim() ? note.trim() : null,
      },
    });

    const [cookedAggregate, cookedPage] = await Promise.all([
      prisma.cookedEvent.aggregate({
        where: { postId: post.id },
        _count: { _all: true },
        _avg: { rating: true },
      }),
      getPostCookedEventsPage({
        postId: post.id,
        familySpaceId: user.familySpaceId,
      }),
    ]);

    return NextResponse.json(
      {
        cookedStats: {
          timesCooked: cookedAggregate._count._all,
          averageRating: cookedAggregate._avg.rating,
        },
        recentCooked: cookedPage.entries,
        recentCookedPage: {
          hasMore: cookedPage.hasMore,
          nextOffset: cookedPage.nextOffset,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logError('cooked.create.error', error, { postId });
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

export async function GET(request: NextRequest, context: RouteContext) {
  const { postId } = context.params;
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    if (!postId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Post ID is required' } },
        { status: 400 }
      );
    }

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        familySpaceId: user.familySpaceId,
      },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found' } },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl?.searchParams;
    const limitParam = searchParams?.get('limit') ?? null;
    const offsetParam = searchParams?.get('offset') ?? null;
    const rawLimit = limitParam !== null ? Number.parseInt(limitParam, 10) : undefined;
    const rawOffset = offsetParam !== null ? Number.parseInt(offsetParam, 10) : undefined;

    const cookedPage = await getPostCookedEventsPage({
      postId: post.id,
      familySpaceId: user.familySpaceId,
      limit: typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : undefined,
      offset:
        typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? rawOffset : undefined,
    });

    return NextResponse.json({
      cookedEvents: cookedPage.entries,
      hasMore: cookedPage.hasMore,
      nextOffset: cookedPage.nextOffset,
    });
  } catch (error) {
    logError('cooked.list.error', error, { postId });
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
