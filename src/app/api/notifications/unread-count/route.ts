import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { internalError } from '@/lib/apiErrors';

export const GET = withAuth(async (_request, user) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { recipientId: user.id, readAt: null },
    });

    return NextResponse.json({ unreadCount });
  } catch (error) {
    logError('notifications.unread_count.error', error);
    return internalError('Failed to fetch unread notifications');
  }
});
