import { NextResponse } from 'next/server';
import { POST, GET } from '@/app/api/feedback/route';
import { prismaMock, resetPrismaMock } from '../../helpers/mock-prisma';
import { createRequestWithHeaders, parseResponseJSON } from '../../helpers';
import * as session from '@/lib/session';

const mockLogInfo = jest.fn();
const mockLogError = jest.fn();

// Mock dependencies before imports are evaluated
jest.mock('@/lib/prisma', () => ({
  prisma: require('../../helpers/mock-prisma').prismaMock,
}));
jest.mock('@/lib/session', () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  logInfo: (...args: any[]) => mockLogInfo(...args),
  logError: (...args: any[]) => mockLogError(...args),
}));
jest.mock('@/lib/rateLimit', () => ({
  feedbackLimiter: {
    getUserKey: jest.fn(() => 'feedback:user-key'),
    getIPKey: jest.fn(() => 'feedback:ip-key'),
  },
  applyRateLimit: jest.fn(() => null),
}));

const mockGetCurrentUser = session.getCurrentUser as jest.MockedFunction<
  typeof session.getCurrentUser
>;
const { applyRateLimit } = jest.requireMock('@/lib/rateLimit') as {
  applyRateLimit: jest.Mock;
};

describe('/api/feedback', () => {
  const user = {
    id: 'user-123',
    role: 'owner',
    familySpaceId: 'family-1',
    familySpaceName: 'Fam',
    name: 'Test User',
    emailOrUsername: 'user@example.com',
    avatarUrl: null,
  };

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user as any);
    applyRateLimit.mockReturnValue(null);
  });

  describe('POST', () => {
    const buildRequest = (body: any) =>
      createRequestWithHeaders('POST', 'http://localhost:3000/api/feedback', {
        body,
      });

    it('saves submission for signed-in user and emits structured log without message body', async () => {
      const submission = {
        id: 'fb-1',
        userId: user.id,
        familySpaceId: user.familySpaceId,
        contactEmail: 'user@example.com',
        category: 'bug',
        message: 'This is a detailed bug report.',
        pageUrl: 'http://example.com/page',
        userAgent: 'jest',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        user: null,
      };
      prismaMock.feedbackSubmission.create.mockResolvedValue(submission as any);

      const request = buildRequest({
        category: 'bug',
        message: submission.message,
        email: 'user@example.com',
        pageUrl: submission.pageUrl,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(prismaMock.feedbackSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: user.id,
            familySpaceId: user.familySpaceId,
            message: submission.message,
          }),
        })
      );
      expect(mockLogInfo).toHaveBeenCalledWith('feedback.submit', {
        submissionId: submission.id,
        category: 'bug',
        userId: user.id,
        familySpaceId: user.familySpaceId,
      });
      // Ensure we never log the message body
      expect(
        mockLogInfo.mock.calls[0]?.[1] &&
          'message' in mockLogInfo.mock.calls[0][1]
      ).toBe(false);
    });

    it('rejects signed-out without email', async () => {
      mockGetCurrentUser.mockResolvedValue(null as any);
      const request = buildRequest({
        category: 'bug',
        message: 'This is a valid message length',
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);
      expect(response.status).toBe(400);
      expect(data.error.message).toMatch(/Email is required/);
      expect(prismaMock.feedbackSubmission.create).not.toHaveBeenCalled();
    });

    it('accepts signed-out with email and null userId', async () => {
      mockGetCurrentUser.mockResolvedValue(null as any);
      prismaMock.feedbackSubmission.create.mockResolvedValue({
        id: 'fb-2',
        userId: null,
        familySpaceId: null,
        contactEmail: 'anon@example.com',
        category: 'suggestion',
        message: 'A helpful suggestion goes here.',
        pageUrl: null,
        userAgent: 'jest',
        createdAt: new Date(),
      } as any);

      const request = buildRequest({
        category: 'suggestion',
        message: 'A helpful suggestion goes here.',
        email: 'anon@example.com',
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(prismaMock.feedbackSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: null,
            familySpaceId: null,
            contactEmail: 'anon@example.com',
          }),
        })
      );
    });

    it('returns 400 for validation errors', async () => {
      const cases = [
        { body: { category: 'other', message: 'valid message' } },
        { body: { category: 'bug', message: 'short' } },
        {
          body: {
            category: 'bug',
            message: 'valid message',
            pageUrl: 'bad-url',
          },
        },
      ];

      for (const testCase of cases) {
        const response = await POST(buildRequest(testCase.body));
        expect(response.status).toBe(400);
      }
    });

    it('returns 429 when rate limited', async () => {
      applyRateLimit.mockReturnValue(
        NextResponse.json(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests',
            },
          },
          { status: 429 }
        )
      );

      const response = await POST(
        buildRequest({
          category: 'bug',
          message: 'Valid bug report',
          email: 'anon@example.com',
        })
      );
      expect(response.status).toBe(429);
      expect(prismaMock.feedbackSubmission.create).not.toHaveBeenCalled();
    });
  });

  describe('GET', () => {
    const submissions = [
      {
        id: 'fb-1',
        category: 'bug',
        message: 'Bug message',
        contactEmail: 'a@example.com',
        userId: 'user-1',
        user: { name: 'User One', emailOrUsername: 'a@example.com' },
        familySpaceId: 'family-1',
        pageUrl: 'http://example.com/page1',
        userAgent: 'jest',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
      {
        id: 'fb-2',
        category: 'suggestion',
        message: 'Suggestion message',
        contactEmail: null,
        userId: null,
        user: null,
        familySpaceId: null,
        pageUrl: null,
        userAgent: 'jest',
        createdAt: new Date('2025-01-02T00:00:00Z'),
      },
    ];

    beforeEach(() => {
      resetPrismaMock();
      mockGetCurrentUser.mockResolvedValue(user as any);
      prismaMock.feedbackSubmission.findMany.mockResolvedValue(
        submissions as any
      );
    });

    it('requires owner/admin', async () => {
      mockGetCurrentUser.mockResolvedValue({ ...user, role: 'member' } as any);
      const request = createRequestWithHeaders(
        'GET',
        'http://localhost:3000/api/feedback'
      );

      const response = await GET(request);
      expect(response.status).toBe(403);
    });

    it('returns combined family and orphaned submissions by default', async () => {
      const request = createRequestWithHeaders(
        'GET',
        'http://localhost:3000/api/feedback'
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(prismaMock.feedbackSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { familySpaceId: user.familySpaceId },
              { familySpaceId: null },
            ],
          }),
        })
      );
      expect(data.page.hasMore).toBe(false);
      expect(data.page.nextOffset).toBe(2);
    });

    it('respects category filter, pagination, and includeOrphaned=false', async () => {
      const filtered = [submissions[0]];
      prismaMock.feedbackSubmission.findMany.mockResolvedValue(filtered as any);

      const request = createRequestWithHeaders(
        'GET',
        'http://localhost:3000/api/feedback?category=bug&limit=1&offset=0&includeOrphaned=false'
      );

      const response = await GET(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(prismaMock.feedbackSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familySpaceId: user.familySpaceId, category: 'bug' },
          skip: 0,
          take: 2, // limit + 1
        })
      );
      expect(data.page.nextOffset).toBe(1);
      expect(data.page.hasMore).toBe(false);
    });
  });
});
