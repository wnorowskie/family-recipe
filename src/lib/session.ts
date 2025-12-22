import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import {
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
} from './session-core';

type GetSignedUploadUrl = (typeof import('./uploads'))['getSignedUploadUrl'];
let cachedGetSignedUploadUrl: Promise<GetSignedUploadUrl> | null = null;

async function loadSignedUrlResolver(): Promise<GetSignedUploadUrl> {
  if (!cachedGetSignedUploadUrl) {
    cachedGetSignedUploadUrl = import('./uploads').then(
      (mod) => mod.getSignedUploadUrl
    );
  }
  return cachedGetSignedUploadUrl;
}

export async function getCurrentUser(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return null;
  }

  try {
    const getSignedUploadUrl = await loadSignedUrlResolver();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          where: { familySpaceId: session.familySpaceId },
          include: {
            familySpace: true,
          },
        },
      },
    });

    if (!user || user.memberships.length === 0) {
      return null;
    }

    const membership = user.memberships[0];
    const avatarUrl = await getSignedUploadUrl(user.avatarStorageKey);

    return {
      id: user.id,
      name: user.name,
      emailOrUsername: user.emailOrUsername,
      avatarUrl,
      role: membership.role,
      familySpaceId: membership.familySpaceId,
      familySpaceName: membership.familySpace.name,
    };
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

export { setSessionCookie, clearSessionCookie, getSessionFromRequest };
