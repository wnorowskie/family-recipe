import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { getAllTags } from '@/lib/tags';

export const GET = withAuth(async (request, user) => {
  const groups = await getAllTags();

  return NextResponse.json({ groups });
});
