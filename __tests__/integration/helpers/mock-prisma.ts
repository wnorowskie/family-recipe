import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

/**
 * Type-safe mock of Prisma Client for testing
 */
export type MockPrisma = DeepMockProxy<PrismaClient>;

/**
 * Deep mock of Prisma Client that can be used in tests
 * Provides full type safety and IDE autocomplete
 */
export const prismaMock = mockDeep<PrismaClient>();

/**
 * Helper function to reset the Prisma mock
 * Call this in your test's beforeEach hook
 */
export const resetPrismaMock = () => {
  mockReset(prismaMock);
};
