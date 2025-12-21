import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { removeFamilyMember } from '@/lib/family';
import { logError } from '@/lib/logger';
import { withAuth } from '@/lib/apiAuth';
import { canRemoveMember } from '@/lib/permissions';
import { parseRouteParams, notFoundError, forbiddenError, internalError } from '@/lib/apiErrors';
import { userIdParamSchema } from '@/lib/validation';

export const DELETE = withAuth(async (request, user, context?: { params: { userId: string } }) => {
  try {
    const { params } = context!;
    const validation = parseRouteParams(params, userIdParamSchema);
    if (!validation.success) return validation.error;
    const targetUserId = validation.data.userId;

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
      return notFoundError('Member not found');
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
      return forbiddenError(messages[permissionCheck.reason!]);
    }

    try {
      const result = await removeFamilyMember(user.familySpaceId, targetUserId);

      if (!result.removed) {
        return notFoundError('Member not found');
      }

      return NextResponse.json({ status: 'removed' }, { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CANNOT_REMOVE_OWNER') {
        return forbiddenError('Cannot remove the owner');
      }
      throw error;
    }
  } catch (error) {
    logError('family.members.remove.error', error, { targetUserId: context?.params?.userId });
    return internalError('Unable to remove member');
  }
});
