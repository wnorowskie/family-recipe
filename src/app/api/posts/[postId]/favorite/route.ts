import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';

interface RouteContext {
  params: {
    postId: string;
  };
}

async function ensurePostAccess(postId: string, familySpaceId: string) {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      familySpaceId,
    },
    select: { id: true },
  });

  return Boolean(post);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const postId = params.postId;

    const canAccess = await ensurePostAccess(postId, user.familySpaceId);

    if (!canAccess) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found' } },
        { status: 404 }
      );
    }

    await prisma.favorite.upsert({
      where: {
        userId_postId: {
          userId: user.id,
          postId,
        },
      },
      create: {
        userId: user.id,
        postId,
      },
      update: {},
    });

    return NextResponse.json({ status: 'favorited' }, { status: 200 });
  } catch (error) {
    logError('favorites.add.error', error, { postId: params?.postId });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to favorite post' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const postId = params.postId;

    const canAccess = await ensurePostAccess(postId, user.familySpaceId);

    if (!canAccess) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Post not found' } },
        { status: 404 }
      );
    }

    await prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        postId,
      },
    });

    return NextResponse.json({ status: 'unfavorited' }, { status: 200 });
  } catch (error) {
    logError('favorites.remove.error', error, { postId: params?.postId });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to remove favorite' } },
      { status: 500 }
    );
  }
}
