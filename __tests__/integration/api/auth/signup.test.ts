/**
 * Integration Tests: POST /api/auth/signup
 *
 * Tests user signup functionality including:
 * - Input validation
 * - Family master key verification
 * - User creation and role assignment
 * - JWT token generation
 * - First user becomes owner, subsequent users become members
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signup/route';
import { prismaMock, resetPrismaMock } from '../../helpers/mock-prisma';
import {
  createMockUser,
  createMockFamilySpace,
  createMockFamilyMembership,
} from '../../helpers/test-data';
import {
  createUnauthenticatedRequest,
  parseResponseJSON,
} from '../../helpers/request-helpers';
import { getSignedUploadUrl } from '@/lib/uploads';

// Mock dependencies
jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: require('../../helpers/mock-prisma').prismaMock,
}));

jest.mock('@/lib/auth');
jest.mock('@/lib/jwt');
jest.mock('@/lib/logger');
jest.mock('@/lib/rateLimit', () => ({
  signupLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  applyRateLimit: jest.fn().mockReturnValue(null),
}));
jest.mock('@/lib/masterKey');
jest.mock('@/lib/uploads', () => ({
  getSignedUploadUrl: jest.fn(),
}));

import { hashPassword, verifyPassword } from '@/lib/auth';
import { signToken } from '@/lib/jwt';
import { ensureFamilySpace, getEnvMasterKeyHash } from '@/lib/masterKey';

const mockHashPassword = hashPassword as jest.MockedFunction<
  typeof hashPassword
>;
const mockVerifyPassword = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;
const mockSignToken = signToken as jest.MockedFunction<typeof signToken>;
const mockGetSignedUploadUrl = getSignedUploadUrl as jest.MockedFunction<
  typeof getSignedUploadUrl
>;

describe('POST /api/auth/signup', () => {
  const mockEnsureFamilySpace = ensureFamilySpace as jest.MockedFunction<
    typeof ensureFamilySpace
  >;
  const mockGetEnvMasterKeyHash = getEnvMasterKeyHash as jest.MockedFunction<
    typeof getEnvMasterKeyHash
  >;
  const defaultFamilySpace = createMockFamilySpace();

  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();

    // Default mocks
    mockHashPassword.mockResolvedValue('$2b$10$hashedPassword');
    mockSignToken.mockResolvedValue('mock-jwt-token');
    mockGetEnvMasterKeyHash.mockResolvedValue('env-master-key-hash');
    mockEnsureFamilySpace.mockResolvedValue(defaultFamilySpace as any);
    mockGetSignedUploadUrl.mockResolvedValue(
      'https://signed.example/avatar.jpg'
    );
    process.env.FAMILY_MASTER_KEY = 'env-master-key';
  });

  afterAll(() => {
    delete process.env.FAMILY_MASTER_KEY;
    delete process.env.FAMILY_MASTER_KEY_HASH;
  });

  const validSignupData = {
    name: 'John Doe',
    emailOrUsername: 'john@example.com',
    password: 'SecurePassword123!',
    familyMasterKey: 'correct-master-key',
    rememberMe: false,
  };

  describe('Validation', () => {
    it('requires all fields', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          name: 'John Doe',
          // Missing other required fields
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires name field', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          name: undefined,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires emailOrUsername field', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          emailOrUsername: undefined,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires password field', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          password: undefined,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires familyMasterKey field', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          familyMasterKey: undefined,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects password shorter than 8 characters', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          password: 'short',
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty emailOrUsername', async () => {
      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          emailOrUsername: '',
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Duplicate User Prevention', () => {
    it('rejects duplicate emailOrUsername', async () => {
      const existingUser = createMockUser({
        emailOrUsername: 'john@example.com',
      });
      prismaMock.user.findUnique.mockResolvedValue(existingUser);

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          emailOrUsername: 'john@example.com',
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('already exists');
    });
  });

  describe('Family Master Key Verification', () => {
    it('rejects incorrect family master key', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(
        createMockFamilySpace() as any
      );
      mockVerifyPassword.mockResolvedValue(false);

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          familyMasterKey: 'wrong-key',
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('Invalid Family Master Key');
    });

    it('accepts correct family master key', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        familySpaceId: familySpace.id,
        role: 'owner',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(0); // First user
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockVerifyPassword).toHaveBeenCalledWith(
        validSignupData.familyMasterKey,
        'env-master-key-hash'
      );
    });
  });

  describe('User Creation', () => {
    it('creates user with hashed password', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        role: 'owner',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(0);
      mockVerifyPassword.mockResolvedValue(true);

      const mockUserCreate = jest.fn().mockResolvedValue(newUser);
      const mockMembershipCreate = jest.fn().mockResolvedValue(membership);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: mockUserCreate },
          familyMembership: { create: mockMembershipCreate },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      await POST(request);

      expect(mockHashPassword).toHaveBeenCalledWith(validSignupData.password);
      expect(mockUserCreate).toHaveBeenCalledWith({
        data: {
          name: validSignupData.name,
          emailOrUsername: validSignupData.emailOrUsername,
          passwordHash: '$2b$10$hashedPassword',
        },
      });
    });

    it('creates family membership record', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        familySpaceId: familySpace.id,
        role: 'member',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1); // Not first user
      mockVerifyPassword.mockResolvedValue(true);
      mockEnsureFamilySpace.mockResolvedValue(familySpace as any);

      const mockUserCreate = jest.fn().mockResolvedValue(newUser);
      const mockMembershipCreate = jest.fn().mockResolvedValue(membership);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: mockUserCreate },
          familyMembership: { create: mockMembershipCreate },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      await POST(request);

      expect(mockMembershipCreate).toHaveBeenCalledWith({
        data: {
          familySpaceId: familySpace.id,
          userId: newUser.id,
          role: 'member',
        },
      });
    });
  });

  describe('Role Assignment', () => {
    it('assigns owner role to first user', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'first_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        role: 'owner',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(0); // First user
      mockVerifyPassword.mockResolvedValue(true);

      const mockMembershipCreate = jest.fn().mockResolvedValue(membership);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: mockMembershipCreate },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(data.user.role).toBe('owner');
      expect(mockMembershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'owner' }),
      });
    });

    it('assigns member role to subsequent users', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'second_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        role: 'member',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(5); // Not first user
      mockVerifyPassword.mockResolvedValue(true);

      const mockMembershipCreate = jest.fn().mockResolvedValue(membership);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: mockMembershipCreate },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(data.user.role).toBe('member');
      expect(mockMembershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'member' }),
      });
    });
  });

  describe('JWT Token Generation', () => {
    it('generates JWT token with correct payload', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        familySpaceId: familySpace.id,
        role: 'member',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1);
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      await POST(request);

      expect(mockSignToken).toHaveBeenCalledWith(
        {
          userId: newUser.id,
          familySpaceId: membership.familySpaceId,
          role: membership.role,
        },
        false
      );
    });

    it('uses rememberMe flag for token expiration', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({ userId: newUser.id });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1);
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
          rememberMe: true,
        }
      );

      await POST(request);

      expect(mockSignToken).toHaveBeenCalledWith(
        expect.any(Object),
        true // rememberMe flag
      );
    });
  });

  describe('Success Response', () => {
    it('returns 201 status code', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({ userId: newUser.id });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1);
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it('returns user profile without password hash', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({
        id: 'new_user_id',
        name: 'John Doe',
        emailOrUsername: 'john@example.com',
        avatarStorageKey: null,
      });
      const membership = createMockFamilyMembership({
        userId: newUser.id,
        familySpaceId: familySpace.id,
        role: 'member',
      });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1);
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      mockGetSignedUploadUrl.mockResolvedValueOnce(null);

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(data.user).toEqual({
        id: newUser.id,
        name: newUser.name,
        emailOrUsername: newUser.emailOrUsername,
        avatarUrl: null,
        role: membership.role,
        familySpaceId: membership.familySpaceId,
      });
      expect(data.user).not.toHaveProperty('passwordHash');
    });

    it('sets session cookie in response', async () => {
      const familySpace = createMockFamilySpace();
      const newUser = createMockUser({ id: 'new_user_id' });
      const membership = createMockFamilyMembership({ userId: newUser.id });

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(familySpace as any);
      prismaMock.familyMembership.count.mockResolvedValue(1);
      mockVerifyPassword.mockResolvedValue(true);

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          familyMembership: { create: jest.fn().mockResolvedValue(membership) },
        });
      });

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain('session=');
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when family space not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.familySpace.findFirst.mockResolvedValue(null);

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('returns 500 on database error', async () => {
      prismaMock.user.findUnique.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = createUnauthenticatedRequest(
        'POST',
        'http://localhost/api/auth/signup',
        {
          ...validSignupData,
        }
      );

      const response = await POST(request);
      const data = await parseResponseJSON(response);

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
