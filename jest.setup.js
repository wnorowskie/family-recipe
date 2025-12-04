// Mock environment variables
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-min';
process.env.NODE_ENV = 'test';

// Mock Prisma Client globally
jest.mock('./src/lib/prisma', () => ({
  prisma: {
    user: {},
    familySpace: {},
    familyMembership: {},
    post: {},
    recipeDetails: {},
    comment: {},
    reaction: {},
    cookedEvent: {},
    favorite: {},
    tag: {},
    postTag: {},
    postPhoto: {},
  },
}));

// Mock rate limiters globally to avoid rate limiting in tests
jest.mock('./src/lib/rateLimit', () => ({
  signupLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
  loginLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
  postCreationLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
  commentLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
  cookedEventLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
  reactionLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  },
}));

// Suppress console logs in tests (uncomment if needed)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };
