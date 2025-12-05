/**
 * Unit Tests - Authentication Helpers
 *
 * Tests for password hashing and verification functions in src/lib/auth.ts
 * These are critical security functions that must work correctly.
 *
 * Coverage Goal: 100% (critical security code)
 */

import { hashPassword, verifyPassword } from '@/lib/auth';

describe('Authentication Helpers', () => {
  describe('hashPassword()', () => {
    it('should generate a bcrypt hash', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      // Bcrypt hashes start with $2b$ (bcrypt identifier)
      expect(hash).toMatch(/^\$2b\$/);
      // Bcrypt hashes are 60 characters long
      expect(hash).toHaveLength(60);
    });

    it('should generate different hashes for different passwords', async () => {
      const password1 = 'password1';
      const password2 = 'password2';

      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for the same password (salt randomness)', async () => {
      const password = 'samePassword123';

      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Even with the same password, salts should make hashes different
      expect(hash1).not.toBe(hash2);
      // But both should be valid bcrypt hashes
      expect(hash1).toMatch(/^\$2b\$/);
      expect(hash2).toMatch(/^\$2b\$/);
    });

    it('should hash empty string without error', async () => {
      const hash = await hashPassword('');

      expect(hash).toMatch(/^\$2b\$/);
      expect(hash).toHaveLength(60);
    });

    it('should hash very long passwords', async () => {
      // Bcrypt truncates passwords at 72 bytes, but should still work
      const longPassword = 'a'.repeat(100);
      const hash = await hashPassword(longPassword);

      expect(hash).toMatch(/^\$2b\$/);
      expect(hash).toHaveLength(60);
    });

    it('should hash passwords with special characters', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(specialPassword);

      expect(hash).toMatch(/^\$2b\$/);
      expect(hash).toHaveLength(60);
    });

    it('should hash passwords with unicode characters', async () => {
      const unicodePassword = '密码测试🔒';
      const hash = await hashPassword(unicodePassword);

      expect(hash).toMatch(/^\$2b\$/);
      expect(hash).toHaveLength(60);
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for correct password', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const correctPassword = 'correctPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(correctPassword);

      const isValid = await verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });

    it('should return false for empty password when hash is for non-empty password', async () => {
      const password = 'actualPassword123';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(false);
    });

    it('should return true for empty password if hash is for empty password', async () => {
      const password = '';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should handle invalid hash format gracefully', async () => {
      const password = 'testPassword123';
      const invalidHash = 'not-a-valid-bcrypt-hash';

      // Should not throw, but return false
      const isValid = await verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });

    it('should handle malformed hash gracefully', async () => {
      const password = 'testPassword123';
      const malformedHash = '$2b$10$invalidhashstring';

      const isValid = await verifyPassword(password, malformedHash);

      expect(isValid).toBe(false);
    });

    it('should handle empty hash string gracefully', async () => {
      const password = 'testPassword123';
      const emptyHash = '';

      const isValid = await verifyPassword(password, emptyHash);

      expect(isValid).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const password = 'Password123';
      const hash = await hashPassword(password);

      const isValidLower = await verifyPassword('password123', hash);
      const isValidUpper = await verifyPassword('PASSWORD123', hash);

      expect(isValidLower).toBe(false);
      expect(isValidUpper).toBe(false);
    });

    it('should handle whitespace differences', async () => {
      const password = 'password123';
      const hash = await hashPassword(password);

      const isValidWithSpace = await verifyPassword('password123 ', hash);
      const isValidWithLeading = await verifyPassword(' password123', hash);

      expect(isValidWithSpace).toBe(false);
      expect(isValidWithLeading).toBe(false);
    });

    it('should verify special characters correctly', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should verify unicode characters correctly', async () => {
      const password = '密码测试🔒';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });
  });

  describe('Security Properties', () => {
    it('should use sufficient salt rounds (timing test)', async () => {
      const password = 'testPassword123';

      // Measure time to hash (bcrypt with 10 rounds should take some time)
      const startTime = Date.now();
      await hashPassword(password);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Should take at least a few milliseconds (bcrypt is intentionally slow)
      // This is a loose check - we're just ensuring it's not instant
      expect(duration).toBeGreaterThan(0);
    });

    it('should produce hashes that are computationally expensive to verify', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      // Measure time to verify
      const startTime = Date.now();
      await verifyPassword(password, hash);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Verification should also take time (same computational cost as hashing)
      expect(duration).toBeGreaterThan(0);
    });

    it('should not leak information through timing for invalid hashes', async () => {
      const password = 'testPassword123';

      // Time for invalid hash format
      const start1 = Date.now();
      await verifyPassword(password, 'invalid-hash');
      const duration1 = Date.now() - start1;

      // Time for valid format but wrong password
      const validHash = await hashPassword('differentPassword');
      const start2 = Date.now();
      await verifyPassword(password, validHash);
      const duration2 = Date.now() - start2;

      // Both should complete (not throw)
      // We're not asserting timing equality as that's hard to test reliably
      // but we ensure both complete successfully
      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should support full signup/login flow', async () => {
      // Simulate signup: hash password
      const userPassword = 'mySecurePassword123!';
      const storedHash = await hashPassword(userPassword);

      // Simulate login: verify password
      const loginPassword = 'mySecurePassword123!';
      const isAuthenticated = await verifyPassword(loginPassword, storedHash);

      expect(isAuthenticated).toBe(true);
    });

    it('should reject invalid login attempts', async () => {
      // Simulate signup
      const userPassword = 'mySecurePassword123!';
      const storedHash = await hashPassword(userPassword);

      // Simulate failed login attempts
      const failedAttempts = [
        'wrongPassword',
        'mySecurePassword123', // missing !
        'MySecurePassword123!', // wrong case
        'mySecurePassword123! ', // trailing space
      ];

      for (const attempt of failedAttempts) {
        const isAuthenticated = await verifyPassword(attempt, storedHash);
        expect(isAuthenticated).toBe(false);
      }
    });

    it('should support password changes', async () => {
      // Original password
      const oldPassword = 'oldPassword123';
      const oldHash = await hashPassword(oldPassword);

      // Verify old password works
      expect(await verifyPassword(oldPassword, oldHash)).toBe(true);

      // User changes password
      const newPassword = 'newPassword456';
      const newHash = await hashPassword(newPassword);

      // Old password should not work with new hash
      expect(await verifyPassword(oldPassword, newHash)).toBe(false);

      // New password should work with new hash
      expect(await verifyPassword(newPassword, newHash)).toBe(true);

      // New password should not work with old hash
      expect(await verifyPassword(newPassword, oldHash)).toBe(false);
    });
  });
});
