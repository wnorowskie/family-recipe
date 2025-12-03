import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';
import { prisma } from './prisma';

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE_DEFAULT = 7 * 24 * 60 * 60; // 7 days in seconds
const COOKIE_MAX_AGE_EXTENDED = 30 * 24 * 60 * 60; // 30 days in seconds

export function setSessionCookie(
  response: NextResponse,
  token: string,
  rememberMe: boolean = false
): void {
  const maxAge = rememberMe ? COOKIE_MAX_AGE_EXTENDED : COOKIE_MAX_AGE_DEFAULT;
  const isProduction = process.env.NODE_ENV === 'production';
  
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

export async function getSessionFromRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  
  if (!token) {
    return null;
  }
  
  return verifyToken(token);
}

export async function getCurrentUser(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  
  if (!session) {
    return null;
  }
  
  try {
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
    
    return {
      id: user.id,
      name: user.name,
      emailOrUsername: user.emailOrUsername,
      avatarUrl: user.avatarUrl,
      role: membership.role,
      familySpaceId: membership.familySpaceId,
      familySpaceName: membership.familySpace.name,
    };
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}
