import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reactionSchema } from '@/lib/validation';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { reactionLimiter, applyRateLimit } from '@/lib/rateLimit';

type TargetType = 'post' | 'comment';

async function buildReactionSummary(targetType: TargetType, targetId: string) {
  const reactions = await prisma.reaction.findMany({
    where: {
      targetType,
      targetId,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  const summaryMap = reactions.reduce(
    (acc, reaction) => {
      const entry = acc.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        count: 0,
        users: [] as Array<{ id: string; name: string; avatarUrl: string | null }>,
      };
      entry.count += 1;
      entry.users.push({
        id: reaction.user.id,
        name: reaction.user.name,
        avatarUrl: reaction.user.avatarUrl,
      });
      acc.set(reaction.emoji, entry);
      return acc;
    },
    new Map<string, { emoji: string; count: number; users: Array<{ id: string; name: string; avatarUrl: string | null }> }>()
  );

  return Array.from(summaryMap.values());
}

export const POST = withAuth(async (request, user) => {
  try {
    // Apply rate limiting (30 reactions per user per minute)
    const rateLimitResult = applyRateLimit(
      reactionLimiter,
      reactionLimiter.getUserKey(user.id)
    );
    if (rateLimitResult) {
      return rateLimitResult;
    }

    const body = await request.json().catch(() => null);

    const validationResult = reactionSchema.safeParse(body);

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

    const { targetType, targetId, emoji } = validationResult.data;

    if (targetType === 'post') {
      const post = await prisma.post.findFirst({
        where: {
          id: targetId,
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
    } else {
      const comment = await prisma.comment.findFirst({
        where: {
          id: targetId,
          post: { familySpaceId: user.familySpaceId },
        },
        select: { id: true },
      });

      if (!comment) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Comment not found' } },
          { status: 404 }
        );
      }
    }

    const existingReaction = await prisma.reaction.findFirst({
      where: {
        targetType,
        targetId,
        userId: user.id,
        emoji,
      },
    });

    if (existingReaction) {
      await prisma.reaction.delete({ where: { id: existingReaction.id } });
    } else {
      await prisma.reaction.create({
        data: {
          targetType,
          targetId,
          emoji,
          userId: user.id,
        },
      });
    }

    const summary = await buildReactionSummary(targetType, targetId);

    return NextResponse.json({
      reactions: summary,
    });
  } catch (error) {
    logError('reactions.toggle.error', error);
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
