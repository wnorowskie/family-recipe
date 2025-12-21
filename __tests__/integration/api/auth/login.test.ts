import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';
import { prisma } from '@/lib/prisma';
import * as auth from '@/lib/auth';
import * as jwt from '@/lib/jwt';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock auth helpers
jest.mock('@/lib/auth', () => ({
  verifyPassword: jest.fn(),
}));

// Mock JWT
jest.mock('@/lib/jwt', () => ({
  signToken: jest.fn(),
}));

const mockPrismaFindUnique = prisma.user.findUnique as jest.MockedFunction<
  typeof prisma.user.findUnique
>;

const mockVerifyPassword = auth.verifyPassword as jest.MockedFunction<
  typeof auth.verifyPassword
>;

const mockSignToken = jwt.signToken as jest.MockedFunction<typeof jwt.signToken>;

describe('POST /api/auth/login', () => {
  const mockUser = {
    id: 'clq1234567890abcdef',
    name: 'Test User',
    emailOrUsername: 'test@example.com',
    passwordHash: '$2a$10$hashedpassword',
    avatarUrl: 'https://example.com/avatar.jpg',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    memberships: [
      {
        id: 'membership_123',
        userId: 'clq1234567890abcdef',
        familySpaceId: 'family_test123',
        role: 'member' as const,
        createdAt: new Date('2025-01-01'),
        familySpace: {
          id: 'family_test123',
          name: 'Test Family',
          masterKeyHash: '$2a$10$hashedkey',
          createdAt: new Date('2025-01-01'),
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function parseResponseJSON(response: Response) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  describe('Validation', () => {
    it('requires emailOrUsername', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toBeTruthy();
    });

    it('requires password', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toBeTruthy();
    });

    it('rejects empty emailOrUsername', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: '',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty password', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: '',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Authentication - User Not Found', () => {
    it('returns 401 for non-existent user', async () => {
      mockPrismaFindUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'nonexistent@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('INVALID_CREDENTIALS');
      expect(data.error.message).toBe('Invalid credentials');
      expect(mockPrismaFindUnique).toHaveBeenCalledWith({
        where: { emailOrUsername: 'nonexistent@example.com' },
        include: {
          memberships: {
            include: {
              familySpace: true,
            },
          },
        },
      });
    });
  });

  describe('Authentication - Invalid Password', () => {
    it('returns 401 for incorrect password', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'wrongpassword',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('INVALID_CREDENTIALS');
      expect(data.error.message).toBe('Invalid credentials');
      expect(mockVerifyPassword).toHaveBeenCalledWith('wrongpassword', mockUser.passwordHash);
    });
  });

  describe('Authorization - No Family Membership', () => {
    it('returns 403 when user has no family membership', async () => {
      const userWithoutMembership = {
        ...mockUser,
        memberships: [],
      };

      mockPrismaFindUnique.mockResolvedValue(userWithoutMembership);
      mockVerifyPassword.mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('User is not a member of any family space');
    });
  });

  describe('Success Cases', () => {
    it('authenticates user with correct credentials', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockResolvedValue('mock-jwt-token-12345');

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.user).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        emailOrUsername: mockUser.emailOrUsername,
        avatarUrl: mockUser.avatarUrl,
        role: mockUser.memberships[0].role,
        familySpaceId: mockUser.memberships[0].familySpaceId,
        familySpaceName: mockUser.memberships[0].familySpace.name,
      });
      expect(mockSignToken).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          familySpaceId: mockUser.memberships[0].familySpaceId,
          role: mockUser.memberships[0].role,
        },
        false
      );
    });

    it('returns JWT token and sets session cookie', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockResolvedValue('mock-jwt-token-12345');

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      
      // Verify session cookie is set
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('session=');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toMatch(/SameSite=(Lax|lax)/);
      expect(cookies).toContain('Path=/');
    });

    it('respects rememberMe flag for token expiration', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockResolvedValue('mock-jwt-token-12345');

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
          rememberMe: true,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockSignToken).toHaveBeenCalledWith(
        expect.any(Object),
        true // rememberMe flag
      );
    });

    it('handles users with different roles correctly', async () => {
      const ownerUser = {
        ...mockUser,
        memberships: [
          {
            ...mockUser.memberships[0],
            role: 'owner' as const,
          },
        ],
      };

      mockPrismaFindUnique.mockResolvedValue(ownerUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockResolvedValue('mock-jwt-token-12345');

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.user.role).toBe('owner');
    });

    it('handles users without avatarUrl', async () => {
      const userWithoutAvatar = {
        ...mockUser,
        avatarUrl: null,
      };

      mockPrismaFindUnique.mockResolvedValue(userWithoutAvatar);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockResolvedValue('mock-jwt-token-12345');

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(200);
      expect(data.user.avatarUrl).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles database errors during user lookup', async () => {
      mockPrismaFindUnique.mockRejectedValue(new Error('Database connection error'));

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles password verification errors', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockRejectedValue(new Error('Bcrypt error'));

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('handles JWT token generation errors', async () => {
      mockPrismaFindUnique.mockResolvedValue(mockUser);
      mockVerifyPassword.mockResolvedValue(true);
      mockSignToken.mockRejectedValue(new Error('JWT signing error'));

      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrUsername: 'test@example.com',
          password: 'password123',
        }),
      });

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
