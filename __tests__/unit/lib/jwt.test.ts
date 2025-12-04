/**
 * Unit Tests: JWT Utilities (src/lib/jwt.ts)
 * 
 * Tests token generation and verification using jose library.
 * Mocks jose to avoid real JWT operations in tests.
 */

import { signToken, verifyToken, JWTPayload } from '@/lib/jwt';

// Mock jose library
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockImplementation(async () => 'mock-jwt-token'),
  })),
  jwtVerify: jest.fn(),
}));

// Import the mocked jose to access mock functions
import { SignJWT, jwtVerify } from 'jose';

describe('JWT Utilities', () => {
  const mockPayload: JWTPayload = {
    userId: 'user_123',
    familySpaceId: 'family_456',
    role: 'member',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signToken()', () => {
    it('should create token with correct payload structure', async () => {
      const token = await signToken(mockPayload);

      expect(token).toBe('mock-jwt-token');
      expect(SignJWT).toHaveBeenCalledWith(mockPayload);
    });

    it('should set correct JWT headers and claims', async () => {
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('mock-jwt-token'),
      };

      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      await signToken(mockPayload);

      expect(mockInstance.setProtectedHeader).toHaveBeenCalledWith({ alg: 'HS256' });
      expect(mockInstance.setIssuedAt).toHaveBeenCalled();
      expect(mockInstance.setIssuer).toHaveBeenCalledWith('family-recipe-app');
      expect(mockInstance.setExpirationTime).toHaveBeenCalledWith('7d');
      expect(mockInstance.sign).toHaveBeenCalled();
    });

    it('should use 7d expiration by default', async () => {
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('mock-jwt-token'),
      };

      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      await signToken(mockPayload, false);

      expect(mockInstance.setExpirationTime).toHaveBeenCalledWith('7d');
    });

    it('should use 30d expiration when rememberMe is true', async () => {
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('mock-jwt-token'),
      };

      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      await signToken(mockPayload, true);

      expect(mockInstance.setExpirationTime).toHaveBeenCalledWith('30d');
    });

    it('should include all required payload fields', async () => {
      await signToken(mockPayload);

      const callArgs = (SignJWT as jest.Mock).mock.calls[0][0];
      expect(callArgs).toHaveProperty('userId', 'user_123');
      expect(callArgs).toHaveProperty('familySpaceId', 'family_456');
      expect(callArgs).toHaveProperty('role', 'member');
    });

    it('should handle owner role', async () => {
      const ownerPayload: JWTPayload = {
        userId: 'user_owner',
        familySpaceId: 'family_456',
        role: 'owner',
      };

      await signToken(ownerPayload);

      const callArgs = (SignJWT as jest.Mock).mock.calls[0][0];
      expect(callArgs.role).toBe('owner');
    });
  });

  describe('verifyToken()', () => {
    it('should return valid payload for valid token', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_123',
          familySpaceId: 'family_456',
          role: 'member',
        },
      });

      const result = await verifyToken('valid-token');

      expect(result).toEqual({
        userId: 'user_123',
        familySpaceId: 'family_456',
        role: 'member',
      });
      expect(jwtVerify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(Object),
        { issuer: 'family-recipe-app' }
      );
    });

    it('should return null for expired token', async () => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Token expired'));

      const result = await verifyToken('expired-token');

      expect(result).toBeNull();
    });

    it('should return null for invalid token', async () => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid signature'));

      const result = await verifyToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for malformed token', async () => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Malformed JWT'));

      const result = await verifyToken('not-a-jwt');

      expect(result).toBeNull();
    });

    it('should validate payload structure - userId must be string', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 12345, // Invalid: number instead of string
          familySpaceId: 'family_456',
          role: 'member',
        },
      });

      const result = await verifyToken('token-with-invalid-userId');

      expect(result).toBeNull();
    });

    it('should validate payload structure - familySpaceId must be string', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_123',
          familySpaceId: null, // Invalid: null instead of string
          role: 'member',
        },
      });

      const result = await verifyToken('token-with-invalid-familySpaceId');

      expect(result).toBeNull();
    });

    it('should validate payload structure - role must be string', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_123',
          familySpaceId: 'family_456',
          role: undefined, // Invalid: undefined instead of string
        },
      });

      const result = await verifyToken('token-with-invalid-role');

      expect(result).toBeNull();
    });

    it('should validate payload structure - all fields must exist', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_123',
          // Missing familySpaceId and role
        },
      });

      const result = await verifyToken('token-with-missing-fields');

      expect(result).toBeNull();
    });

    it('should validate payload types are correct', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_abc',
          familySpaceId: 'family_xyz',
          role: 'admin',
        },
      });

      const result = await verifyToken('valid-token');

      expect(result).not.toBeNull();
      expect(typeof result?.userId).toBe('string');
      expect(typeof result?.familySpaceId).toBe('string');
      expect(typeof result?.role).toBe('string');
    });

    it('should handle empty token string', async () => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Empty token'));

      const result = await verifyToken('');

      expect(result).toBeNull();
    });

    it('should verify issuer matches', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          userId: 'user_123',
          familySpaceId: 'family_456',
          role: 'member',
        },
      });

      await verifyToken('valid-token');

      expect(jwtVerify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ issuer: 'family-recipe-app' })
      );
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete token lifecycle', async () => {
      // Mock sign
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('mock-jwt-token'),
      };
      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      // Generate token
      const token = await signToken(mockPayload);
      expect(token).toBe('mock-jwt-token');

      // Mock verify
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: mockPayload,
      });

      // Verify token
      const result = await verifyToken(token);
      expect(result).toEqual(mockPayload);
    });

    it('should handle token with owner role throughout lifecycle', async () => {
      const ownerPayload: JWTPayload = {
        userId: 'user_owner',
        familySpaceId: 'family_456',
        role: 'owner',
      };

      // Mock sign
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('owner-token'),
      };
      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      const token = await signToken(ownerPayload);

      // Mock verify
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: ownerPayload,
      });

      const result = await verifyToken(token);
      expect(result?.role).toBe('owner');
    });

    it('should handle extended expiration token', async () => {
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockResolvedValue('extended-token'),
      };
      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      await signToken(mockPayload, true);

      expect(mockInstance.setExpirationTime).toHaveBeenCalledWith('30d');
    });
  });

  describe('Error Handling', () => {
    it('should handle jose sign errors gracefully', async () => {
      const mockInstance = {
        setProtectedHeader: jest.fn().mockReturnThis(),
        setIssuedAt: jest.fn().mockReturnThis(),
        setIssuer: jest.fn().mockReturnThis(),
        setExpirationTime: jest.fn().mockReturnThis(),
        sign: jest.fn().mockRejectedValue(new Error('Signing failed')),
      };
      (SignJWT as jest.Mock).mockImplementation(() => mockInstance);

      await expect(signToken(mockPayload)).rejects.toThrow('Signing failed');
    });

    it('should handle various verify error types', async () => {
      const errorTypes = [
        'JWTExpired',
        'JWSSignatureVerificationFailed',
        'JWTInvalid',
        'JWSInvalid',
      ];

      for (const errorType of errorTypes) {
        (jwtVerify as jest.Mock).mockRejectedValue(new Error(errorType));
        const result = await verifyToken('some-token');
        expect(result).toBeNull();
      }
    });
  });
});
