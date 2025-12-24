import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { parseRequestBody, internalError } from '@/lib/apiErrors';
import { markNotificationsSchema } from '@/lib/validation';
import { markNotificationsRead } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json().catch(() => ({}));
    const validation = parseRequestBody(body, markNotificationsSchema);

    if (!validation.success) {
      return validation.error;
    }

    const { ids } = validation.data;

    await markNotificationsRead(user.id, ids);

    const unreadCount = await prisma.notification.count({
      where: { recipientId: user.id, readAt: null },
    });

    return NextResponse.json({ status: 'ok', unreadCount });
  } catch (error) {
    logError('notifications.mark_read.error', error);
    return internalError('Failed to mark notifications as read');
  }
});
