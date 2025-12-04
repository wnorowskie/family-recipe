import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getFamilyMembers } from '@/lib/family';
import { logError } from '@/lib/logger';
import { internalError } from '@/lib/apiErrors';

export const GET = withAuth(async (request, user) => {
  try {
    const members = await getFamilyMembers(user.familySpaceId);

    return NextResponse.json({ members }, { status: 200 });
  } catch (error) {
    logError('family.members.list.error', error);
    return internalError('Unable to load family members');
  }
});
