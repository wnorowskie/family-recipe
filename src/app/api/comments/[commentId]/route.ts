import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { canDeleteComment } from '@/lib/permissions';

const paramsSchema = z.object({
  commentId: z.string().min(1, 'Comment ID is required'),
});

export const DELETE = withAuth(async (request, user, context?: { params: { commentId: string } }) => {
  try {
    const { params } = context!;

    const parseResult = paramsSchema.safeParse(params);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAMS',
            message: parseResult.error.errors[0]?.message ?? 'Invalid comment ID',
          },
        },
        { status: 400 }
      );
    }

    const { commentId } = parseResult.data;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        post: {
          select: { familySpaceId: true },
        },
      },
    });

    if (!comment || comment.post.familySpaceId !== user.familySpaceId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Comment not found' } },
        { status: 404 }
      );
    }

    if (!canDeleteComment(user, comment)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not allowed to delete comment' } },
        { status: 403 }
      );
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logError('comments.delete.error', error, { commentId: context?.params?.commentId });
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
});
