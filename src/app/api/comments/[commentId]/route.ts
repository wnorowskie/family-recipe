import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { logError } from '@/lib/logger';

const paramsSchema = z.object({
  commentId: z.string().min(1, 'Comment ID is required'),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: { commentId: string } }
) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

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

    const isOwner = user.role === 'owner' || user.role === 'admin';
    const isAuthor = comment.authorId === user.id;

    if (!isOwner && !isAuthor) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not allowed to delete comment' } },
        { status: 403 }
      );
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logError('comments.delete.error', error, { commentId: params?.commentId });
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
