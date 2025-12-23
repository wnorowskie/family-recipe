import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { parseQueryParams, internalError } from '@/lib/apiErrors';
import { notificationsQuerySchema } from '@/lib/validation';
import { fetchNotifications } from '@/lib/notifications';
import { logError } from '@/lib/logger';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const validation = parseQueryParams(
      request.nextUrl.searchParams,
      notificationsQuerySchema
    );

    if (!validation.success) {
      return validation.error;
    }

    const { limit, offset } = validation.data;

    const result = await fetchNotifications({
      recipientId: user.id,
      familySpaceId: user.familySpaceId,
      limit,
      offset,
    });

    return NextResponse.json({
      notifications: result.notifications.map((notification) => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
        updatedAt: notification.updatedAt.toISOString(),
        readAt: notification.readAt ? notification.readAt.toISOString() : null,
      })),
      unreadCount: result.unreadCount,
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
    });
  } catch (error) {
    logError('notifications.list.error', error);
    return internalError('Failed to load notifications');
  }
});
