import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { notFoundError, internalError } from '@/lib/apiErrors';

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

export const POST = withAuth(async (request, user, context?: RouteContext) => {
  const { params } = context!;
  try {
    const postId = params.postId;

    const canAccess = await ensurePostAccess(postId, user.familySpaceId);

    if (!canAccess) {
      return notFoundError('Post not found');
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
    logError('favorites.add.error', error, { postId: context?.params?.postId });
    return internalError('Unable to favorite post');
  }
});

export const DELETE = withAuth(async (request, user, context?: RouteContext) => {
  const { params } = context!;
  try {
    const postId = params.postId;

    const canAccess = await ensurePostAccess(postId, user.familySpaceId);

    if (!canAccess) {
      return notFoundError('Post not found');
    }

    await prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        postId,
      },
    });

    return NextResponse.json({ status: 'unfavorited' }, { status: 200 });
  } catch (error) {
    logError('favorites.remove.error', error, { postId: context?.params?.postId });
    return internalError('Unable to remove favorite');
  }
});
