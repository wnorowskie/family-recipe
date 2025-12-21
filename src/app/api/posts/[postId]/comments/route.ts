import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCommentSchema, postIdParamSchema } from '@/lib/validation';
import { savePhotoFile } from '@/lib/uploads';
import { getPostCommentsPage } from '@/lib/posts';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { commentLimiter, applyRateLimit } from '@/lib/rateLimit';
import {
  parseRouteParams,
  badRequestError,
  validationError,
  notFoundError,
  internalError,
} from '@/lib/apiErrors';

export const GET = withAuth(
  async (request, user, context?: { params: { postId: string } }) => {
    try {
      const { params } = context!;
      const validation = parseRouteParams(params, postIdParamSchema);
      if (!validation.success) return validation.error;
      const { postId } = validation.data;

      const post = await prisma.post.findFirst({
        where: {
          id: postId,
          familySpaceId: user.familySpaceId,
        },
        select: { id: true },
      });

      if (!post) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Post not found',
            },
          },
          { status: 404 }
        );
      }

      const searchParams = request.nextUrl?.searchParams;
      const limitParam = searchParams?.get('limit') ?? null;
      const offsetParam = searchParams?.get('offset') ?? null;
      const rawLimit =
        limitParam !== null ? Number.parseInt(limitParam, 10) : undefined;
      const rawOffset =
        offsetParam !== null ? Number.parseInt(offsetParam, 10) : undefined;

      const commentPage = await getPostCommentsPage({
        postId,
        familySpaceId: user.familySpaceId,
        limit:
          typeof rawLimit === 'number' && Number.isFinite(rawLimit)
            ? rawLimit
            : undefined,
        offset:
          typeof rawOffset === 'number' && Number.isFinite(rawOffset)
            ? rawOffset
            : undefined,
      });

      return NextResponse.json({
        comments: commentPage.comments,
        hasMore: commentPage.hasMore,
        nextOffset: commentPage.nextOffset,
      });
    } catch (error) {
      logError('comments.list.error', error, {
        postId: context?.params?.postId,
      });
      return internalError('An unexpected error occurred');
    }
  }
);

export const POST = withAuth(
  async (request, user, context?: { params: { postId: string } }) => {
    try {
      // Apply rate limiting (10 comments per user per minute)
      const rateLimitResult = applyRateLimit(
        commentLimiter,
        commentLimiter.getUserKey(user.id)
      );
      if (rateLimitResult) {
        return rateLimitResult;
      }

      const { params } = context!;
      const validation = parseRouteParams(params, postIdParamSchema);
      if (!validation.success) return validation.error;
      const { postId } = validation.data;

      const post = await prisma.post.findFirst({
        where: {
          id: postId,
          familySpaceId: user.familySpaceId,
        },
        select: { id: true },
      });

      if (!post) {
        return notFoundError('Post not found');
      }

      const formData = await request.formData();
      const rawPayload = formData.get('payload');

      if (!rawPayload || typeof rawPayload !== 'string') {
        return badRequestError('Missing payload');
      }

      const payloadResult = createCommentSchema.safeParse(
        JSON.parse(rawPayload)
      );

      if (!payloadResult.success) {
        return validationError(
          payloadResult.error.errors[0]?.message ?? 'Invalid comment'
        );
      }

      const photoFile = formData.get('photo');
      let photoUrl: string | null = null;

      const isFormDataFile = (entry: unknown): entry is File => {
        if (typeof File !== 'undefined' && entry instanceof File)
          return entry.size > 0;
        if (!entry || typeof entry !== 'object') return false;
        const maybe = entry as any;
        return (
          typeof maybe.size === 'number' &&
          typeof maybe.arrayBuffer === 'function' &&
          maybe.size > 0
        );
      };

      if (isFormDataFile(photoFile)) {
        const saved = await savePhotoFile(photoFile);
        photoUrl = saved.url;
      }

      const comment = await prisma.comment.create({
        data: {
          postId,
          authorId: user.id,
          text: payloadResult.data.text,
          photoUrl,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      return NextResponse.json(
        {
          comment: {
            id: comment.id,
            text: comment.text,
            photoUrl: comment.photoUrl,
            createdAt: comment.createdAt.toISOString(),
            author: comment.author,
            reactions: [],
          },
        },
        { status: 201 }
      );
    } catch (error) {
      logError('comments.create.error', error, {
        postId: context?.params?.postId,
      });
      return internalError('An unexpected error occurred');
    }
  }
);
