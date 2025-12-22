import { getFeedbackForFamily } from '@/lib/feedback';

jest.mock('@/lib/prisma', () => ({
  prisma: require('../../integration/helpers/mock-prisma').prismaMock,
}));

import {
  prismaMock,
  resetPrismaMock,
} from '../../integration/helpers/mock-prisma';

describe('getFeedbackForFamily', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it('maps records to DTO with ISO dates and user info', async () => {
    const createdAt = new Date('2025-01-01T00:00:00Z');
    prismaMock.feedbackSubmission.findMany.mockResolvedValue([
      {
        id: 'fb-1',
        category: 'bug',
        message: 'Bug details',
        contactEmail: 'user@example.com',
        userId: 'u1',
        user: { name: 'User One', emailOrUsername: 'user@example.com' },
        familySpaceId: 'fam-1',
        pageUrl: 'http://example.com',
        userAgent: 'jest',
        createdAt,
      },
    ] as any);

    const page = await getFeedbackForFamily('fam-1', { limit: 10, offset: 0 });

    expect(page.items).toEqual([
      {
        id: 'fb-1',
        category: 'bug',
        message: 'Bug details',
        contactEmail: 'user@example.com',
        userId: 'u1',
        userName: 'User One',
        userEmail: 'user@example.com',
        familySpaceId: 'fam-1',
        pageUrl: 'http://example.com',
        userAgent: 'jest',
        createdAt: createdAt.toISOString(),
      },
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBe(1);
  });

  it('applies includeOrphaned filter correctly', async () => {
    prismaMock.feedbackSubmission.findMany.mockResolvedValue([] as any);

    await getFeedbackForFamily('fam-1', { includeOrphaned: true });
    expect(prismaMock.feedbackSubmission.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ familySpaceId: 'fam-1' }, { familySpaceId: null }],
        }),
      })
    );

    await getFeedbackForFamily('fam-1', { includeOrphaned: false });
    expect(prismaMock.feedbackSubmission.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familySpaceId: 'fam-1',
        }),
      })
    );
  });
});
