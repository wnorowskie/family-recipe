import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getFamilyMembers } from '@/lib/family';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const members = await getFamilyMembers(user.familySpaceId);

    return NextResponse.json({ members }, { status: 200 });
  } catch (error) {
    logError('family.members.list.error', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to load family members',
        },
      },
      { status: 500 }
    );
  }
}
