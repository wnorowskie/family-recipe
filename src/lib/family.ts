import { prisma } from '@/lib/prisma';

export interface FamilyMemberSummary {
  userId: string;
  membershipId: string;
  name: string;
  emailOrUsername: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  postCount: number;
}

export async function getFamilyMembers(familySpaceId: string): Promise<FamilyMemberSummary[]> {
  const memberships = await prisma.familyMembership.findMany({
    where: { familySpaceId },
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          emailOrUsername: true,
          avatarUrl: true,
          posts: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    membershipId: membership.id,
    name: membership.user.name,
    emailOrUsername: membership.user.emailOrUsername,
    avatarUrl: membership.user.avatarUrl,
    role: membership.role,
    joinedAt: membership.createdAt.toISOString(),
    postCount: membership.user.posts.length,
  }));
}

export async function removeFamilyMember(
  familySpaceId: string,
  targetUserId: string
): Promise<{ removed: boolean }> {
  const membership = await prisma.familyMembership.findFirst({
    where: {
      familySpaceId,
      userId: targetUserId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!membership) {
    return { removed: false };
  }

  if (membership.role === 'owner') {
    throw new Error('CANNOT_REMOVE_OWNER');
  }

  await prisma.familyMembership.delete({
    where: { id: membership.id },
  });

  return { removed: true };
}
