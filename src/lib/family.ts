import { prisma } from '@/lib/prisma';
import { createSignedUrlResolver } from '@/lib/uploads';

export interface FamilyMemberSummary {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  username: string;
  emailOrUsername: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  postCount: number;
}

export async function getFamilyMembers(
  familySpaceId: string
): Promise<FamilyMemberSummary[]> {
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
          email: true,
          username: true,
          avatarStorageKey: true,
          posts: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  const resolveUrl = createSignedUrlResolver();

  return Promise.all(
    memberships.map(async (membership: any) => {
      const fallbackEmail =
        (membership.user as any).emailOrUsername ?? membership.user.username;
      const email = membership.user.email ?? fallbackEmail ?? '';
      const username =
        membership.user.username ??
        (typeof fallbackEmail === 'string'
          ? fallbackEmail.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user'
          : 'user');

      return {
        userId: membership.userId,
        membershipId: membership.id,
        name: membership.user.name,
        email,
        username,
        emailOrUsername: email,
        avatarUrl: await resolveUrl(membership.user.avatarStorageKey),
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
        postCount: membership.user.posts.length,
      };
    })
  );
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
