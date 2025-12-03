import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-for-dev'
);
const JWT_EXPIRES_IN = '7d'; // 7 days default
const JWT_EXPIRES_IN_EXTENDED = '30d'; // 30 days for "remember me"

export interface JWTPayload {
  userId: string;
  familySpaceId: string;
  role: string;
}

export async function signToken(
  payload: JWTPayload,
  rememberMe: boolean = false
): Promise<string> {
  const expiresIn = rememberMe ? JWT_EXPIRES_IN_EXTENDED : JWT_EXPIRES_IN;
  
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('family-recipe-app')
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'family-recipe-app',
    });
    
    // Validate payload structure
    if (
      typeof payload.userId === 'string' &&
      typeof payload.familySpaceId === 'string' &&
      typeof payload.role === 'string'
    ) {
      return {
        userId: payload.userId,
        familySpaceId: payload.familySpaceId,
        role: payload.role,
      };
    }
    
    return null;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}
