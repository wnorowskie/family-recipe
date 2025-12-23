import { prisma } from './prisma';

export interface FeedbackListItem {
  id: string;
  category: 'bug' | 'suggestion';
  message: string;
  contactEmail: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  familySpaceId: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface FeedbackPage {
  items: FeedbackListItem[];
  hasMore: boolean;
  nextOffset: number;
}

interface FetchOptions {
  limit?: number;
  offset?: number;
  category?: 'bug' | 'suggestion';
  includeOrphaned?: boolean;
}

export async function getFeedbackForFamily(
  familySpaceId: string,
  options: FetchOptions = {}
): Promise<FeedbackPage> {
  const limit = Math.min(options.limit ?? 20, 50);
  const offset = Math.max(options.offset ?? 0, 0);
  const includeOrphaned = options.includeOrphaned ?? true;
  const where = includeOrphaned
    ? {
        OR: [{ familySpaceId }, { familySpaceId: null }],
      }
    : { familySpaceId };

  const records = await prisma.feedbackSubmission.findMany({
    where: {
      ...where,
      ...(options.category ? { category: options.category } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit + 1,
  });

  const hasMore = records.length > limit;
  const items: FeedbackListItem[] = records
    .slice(0, limit)
    .map((submission: any) => ({
      id: submission.id,
      category: submission.category as 'bug' | 'suggestion',
      message: submission.message,
      contactEmail: submission.contactEmail,
      userId: submission.userId,
      userName: submission.user?.name ?? null,
      userEmail:
        submission.user?.email ??
        (submission.user as any)?.emailOrUsername ??
        null,
      familySpaceId: submission.familySpaceId,
      pageUrl: submission.pageUrl,
      userAgent: submission.userAgent,
      createdAt: submission.createdAt.toISOString(),
    }));

  return {
    items,
    hasMore,
    nextOffset: offset + items.length,
  };
}
