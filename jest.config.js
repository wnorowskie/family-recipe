const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Path to Next.js app for loading next.config.js and .env files
  dir: './',
});

const customJestConfig = {
  // Test environment
  testEnvironment: 'node',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Module paths
  modulePaths: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^glob$': '<rootDir>/__tests__/helpers/glob-default.js',
    '^bcrypt$': 'bcryptjs',
  },

  // Test match patterns
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],

  // Coverage configuration
  collectCoverageFrom: [
    // Include: Business logic and API routes
    'src/lib/**/*.{ts,tsx}',
    'src/app/api/**/*.{ts,tsx}',

    // Exclude: Non-business-logic files
    '!src/lib/prisma.ts', // Prisma client initialization
    '!src/lib/logger.ts', // Simple logger utility
    '!src/app/api/**/route.ts', // Route handlers tested via integration
    '!**/*.d.ts', // Type definitions
    '!**/node_modules/**', // Dependencies
  ],

  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },

  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  // Use native V8 coverage to avoid double transform issues
  coverageProvider: 'v8',

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/figma/',
    '/prisma/migrations/',
  ],
};

module.exports = createJestConfig(customJestConfig);
