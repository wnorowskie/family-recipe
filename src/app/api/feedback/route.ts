import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { feedbackSubmissionSchema } from '@/lib/validation';
import { getCurrentUser } from '@/lib/session';
import { applyRateLimit, feedbackLimiter } from '@/lib/rateLimit';
import {
  parseRequestBody,
  validationError,
  internalError,
  parseQueryParams,
} from '@/lib/apiErrors';
import { logError, logInfo } from '@/lib/logger';
import { paginationSchema } from '@/lib/validation';
import { withRole } from '@/lib/apiAuth';
import { z } from 'zod';
import { getFeedbackForFamily } from '@/lib/feedback';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseRequestBody(body, feedbackSubmissionSchema);

    if (!parsed.success) {
      return parsed.error;
    }

    const { category, message, email, pageUrl } = parsed.data;
    const user = await getCurrentUser(request);
    const contactEmail = email?.trim() || (user ? user.emailOrUsername : null);

    if (!user && !contactEmail) {
      return validationError('Email is required when not signed in');
    }

    const rateKey = user
      ? feedbackLimiter.getUserKey(user.id)
      : contactEmail
        ? `feedback:email:${contactEmail.toLowerCase()}`
        : feedbackLimiter.getIPKey(request);

    const rateLimitResponse = applyRateLimit(feedbackLimiter, rateKey);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const submission = await prisma.feedbackSubmission.create({
      data: {
        userId: user?.id ?? null,
        familySpaceId: user?.familySpaceId ?? null,
        contactEmail,
        category,
        message,
        pageUrl: pageUrl?.trim() || null,
        userAgent: request.headers.get('user-agent'),
      },
    });

    logInfo('feedback.submit', {
      submissionId: submission.id,
      category,
      userId: submission.userId,
      familySpaceId: submission.familySpaceId,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logError('feedback.submit.error', error);
    return internalError();
  }
}

const feedbackQuerySchema = paginationSchema.extend({
  category: feedbackSubmissionSchema.shape.category.optional(),
  includeOrphaned: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return true;
      if (typeof value === 'boolean') return value;
      const normalized = value.toLowerCase();
      return normalized === 'true' || normalized === '1';
    }),
});

export const GET = withRole(['owner', 'admin'], async (request, user) => {
  const parsed = parseQueryParams(
    request.nextUrl.searchParams,
    feedbackQuerySchema
  );

  if (!parsed.success) {
    return parsed.error;
  }

  const { limit, offset, category, includeOrphaned } = parsed.data;

  const page = await getFeedbackForFamily(user.familySpaceId, {
    limit,
    offset,
    category,
    includeOrphaned,
  });

  return NextResponse.json(
    {
      items: page.items,
      page: {
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
      },
    },
    { status: 200 }
  );
});
