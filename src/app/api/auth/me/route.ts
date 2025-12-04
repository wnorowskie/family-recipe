import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';

export const GET = withAuth(async (request, user) => {
  return NextResponse.json({ user }, { status: 200 });
});
