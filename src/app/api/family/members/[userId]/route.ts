import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/session';
import { removeFamilyMember } from '@/lib/family';
import { logError } from '@/lib/logger';

const paramsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

function assertAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    if (!assertAdmin(user.role)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }

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

    if (parsed.data.userId === user.id) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot remove yourself',
          },
        },
        { status: 403 }
      );
    }

    try {
      const result = await removeFamilyMember(user.familySpaceId, parsed.data.userId);

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
    logError('family.members.remove.error', error, { targetUserId: params?.userId });
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
}
