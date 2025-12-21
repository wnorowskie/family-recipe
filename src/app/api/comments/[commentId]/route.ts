import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { canDeleteComment } from '@/lib/permissions';
import { parseRouteParams, notFoundError, forbiddenError, internalError } from '@/lib/apiErrors';
import { commentIdParamSchema } from '@/lib/validation';

export const DELETE = withAuth(async (request, user, context?: { params: { commentId: string } }) => {
  try {
    const { params } = context!;
    const paramsValidation = parseRouteParams(params, commentIdParamSchema);

    if (!paramsValidation.success) {
      return paramsValidation.error;
    }

    const { commentId } = paramsValidation.data;

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
      return notFoundError('Comment not found');
    }

    if (!canDeleteComment(user, comment)) {
      return forbiddenError('Not allowed to delete comment');
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logError('comments.delete.error', error, { commentId: context?.params?.commentId });
    return internalError();
  }
});
