import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reactionSchema } from '@/lib/validation';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { reactionLimiter, applyRateLimit } from '@/lib/rateLimit';
import {
  parseRequestBody,
  notFoundError,
  internalError,
} from '@/lib/apiErrors';
import { createSignedUrlResolver } from '@/lib/uploads';

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
          avatarStorageKey: true,
        },
      },
    },
  });

  const resolveUrl = createSignedUrlResolver();
  const enrichedReactions = await Promise.all(
    reactions.map(async (reaction: any) => ({
      emoji: reaction.emoji,
      user: {
        id: reaction.user.id,
        name: reaction.user.name,
        avatarUrl: await resolveUrl(reaction.user.avatarStorageKey),
      },
      targetId: reaction.targetId,
    }))
  );

  const summaryMap = enrichedReactions.reduce((acc, reaction) => {
    const entry = acc.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      users: [] as Array<{
        id: string;
        name: string;
        avatarUrl: string | null;
      }>,
    };
    entry.count += 1;
    entry.users.push({
      id: reaction.user.id,
      name: reaction.user.name,
      avatarUrl: reaction.user.avatarUrl,
    });
    acc.set(reaction.emoji, entry);
    return acc;
  }, new Map<string, { emoji: string; count: number; users: Array<{ id: string; name: string; avatarUrl: string | null }> }>());

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
    const bodyValidation = parseRequestBody(body, reactionSchema);

    if (!bodyValidation.success) {
      return bodyValidation.error;
    }

    const { targetType, targetId, emoji } = bodyValidation.data;

    if (targetType === 'post') {
      const post = await prisma.post.findFirst({
        where: {
          id: targetId,
          familySpaceId: user.familySpaceId,
        },
        select: { id: true },
      });

      if (!post) {
        return notFoundError('Post not found');
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
        return notFoundError('Comment not found');
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
    return internalError();
  }
});
