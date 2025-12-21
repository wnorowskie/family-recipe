// Mock environment variables
process.env.DATABASE_URL = 'file:./test.db';
// Use env value if provided; otherwise generate a throwaway test secret to avoid hardcoding
if (!process.env.JWT_SECRET) {
  const { randomBytes } = require('crypto');
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
}
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
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  loginLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  postCreationLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  commentLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  cookedEventLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  reactionLimiter: {
    check: jest.fn().mockResolvedValue({ allowed: true }),
    getIPKey: jest.fn().mockReturnValue('test-ip'),
  },
  applyRateLimit: jest.fn().mockReturnValue(null), // null means rate limit not exceeded
}));

// Suppress console noise in tests by default; set ALLOW_TEST_LOGS=true to see logs
if (process.env.ALLOW_TEST_LOGS !== 'true') {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}
