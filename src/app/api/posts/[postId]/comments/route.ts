import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createCommentSchema } from '@/lib/validation';
import { savePhotoFile } from '@/lib/uploads';
import { getPostCommentsPage } from '@/lib/posts';
import { logError } from '@/lib/logger';

const paramsSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
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
            message: parseResult.error.errors[0]?.message ?? 'Invalid post ID',
          },
        },
        { status: 400 }
      );
    }

    const { postId } = parseResult.data;

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
    const rawLimit = limitParam !== null ? Number.parseInt(limitParam, 10) : undefined;
    const rawOffset = offsetParam !== null ? Number.parseInt(offsetParam, 10) : undefined;

    const commentPage = await getPostCommentsPage({
      postId,
      familySpaceId: user.familySpaceId,
      limit:
        typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : undefined,
      offset:
        typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? rawOffset : undefined,
    });

    return NextResponse.json({
      comments: commentPage.comments,
      hasMore: commentPage.hasMore,
      nextOffset: commentPage.nextOffset,
    });
  } catch (error) {
    logError('comments.list.error', error, { postId: params?.postId });
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

export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
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
            message: parseResult.error.errors[0]?.message ?? 'Invalid post ID',
          },
        },
        { status: 400 }
      );
    }

    const { postId } = parseResult.data;

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

    const formData = await request.formData();
    const rawPayload = formData.get('payload');

    if (!rawPayload || typeof rawPayload !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Missing payload',
          },
        },
        { status: 400 }
      );
    }

    const payloadResult = createCommentSchema.safeParse(JSON.parse(rawPayload));

    if (!payloadResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: payloadResult.error.errors[0]?.message ?? 'Invalid comment',
          },
        },
        { status: 400 }
      );
    }

    const photoFile = formData.get('photo');
    let photoUrl: string | null = null;

    if (photoFile instanceof File && photoFile.size > 0) {
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
    logError('comments.create.error', error, { postId: params?.postId });
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
