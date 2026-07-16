import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { fetchSessionUser } from './auth/bootstrapFromCookies';
import { isFastApiAuthEnabled } from './featureFlags';
import { prisma } from './prisma';
import {
  clearSessionCookie,
  getSessionFromRequest,
  hasAnySessionFromRequest,
  setSessionCookie,
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
      email: user.email,
      username: user.username,
      // Backward compatibility for older consumers
      emailOrUsername: user.email,
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

// Dual-mode user resolver for (app) page components. When FastAPI auth is
// enabled the layout has already verified the session; pages call this to get
// the user without repeating the JWT session-cookie dance (which would fail
// because there is no `session` cookie in the FastAPI flow).
export async function resolvePageUser() {
  if (isFastApiAuthEnabled()) {
    const headerStore = await headers();
    const cookieHeader = headerStore.get('cookie');
    const result = await fetchSessionUser(cookieHeader);
    if (!result.ok) return null;
    return result.user;
  }

  // Legacy JWT path — unchanged behaviour.
  return null;
}

export {
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  hasAnySessionFromRequest,
};
