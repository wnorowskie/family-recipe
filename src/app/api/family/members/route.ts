import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getFamilyMembers } from '@/lib/family';
import { logError } from '@/lib/logger';

export const GET = withAuth(async (request, user) => {
  try {
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
});
