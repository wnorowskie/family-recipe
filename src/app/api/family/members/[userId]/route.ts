import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { removeFamilyMember } from '@/lib/family';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { canRemoveMember } from '@/lib/permissions';

const paramsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const DELETE = withAuth(async (request, user, context?: { params: { userId: string } }) => {
  try {
    const { params } = context!;

    const parsed = paramsSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAMS',
            message: parsed.error.errors[0]?.message ?? 'Invalid user ID',
          },
        },
        { status: 400 }
      );
    }

    const targetUserId = parsed.data.userId;

    // Fetch target user to check permissions
    const targetMembership = await prisma.familyMembership.findFirst({
      where: {
        familySpaceId: user.familySpaceId,
        userId: targetUserId,
      },
      include: {
        user: {
          select: { id: true },
        },
      },
    });

    if (!targetMembership) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Member not found' } },
        { status: 404 }
      );
    }

    // Check permissions using helper
    const permissionCheck = canRemoveMember(user, {
      id: targetUserId,
      role: targetMembership.role,
    });

    if (!permissionCheck.allowed) {
      const messages = {
        NOT_ADMIN: 'Insufficient permissions',
        CANNOT_REMOVE_SELF: 'You cannot remove yourself',
        CANNOT_REMOVE_OWNER: 'Cannot remove the owner',
      };
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: messages[permissionCheck.reason!],
          },
        },
        { status: 403 }
      );
    }

    try {
      const result = await removeFamilyMember(user.familySpaceId, targetUserId);

      if (!result.removed) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Member not found' } },
          { status: 404 }
        );
      }

      return NextResponse.json({ status: 'removed' }, { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CANNOT_REMOVE_OWNER') {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Cannot remove the owner' } },
          { status: 403 }
        );
      }
      throw error;
    }
  } catch (error) {
    logError('family.members.remove.error', error, { targetUserId: context?.params?.userId });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to remove member',
        },
      },
      { status: 500 }
    );
  }
});
