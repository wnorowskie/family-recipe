// Unmock the rate limiter module for unit tests
jest.unmock('@/lib/rateLimit');

import { NextRequest, NextResponse } from 'next/server';
import {
  applyRateLimit,
  signupLimiter,
  loginLimiter,
  postCreationLimiter,
  commentLimiter,
  cookedEventLimiter,
  reactionLimiter,
} from '@/lib/rateLimit';

// Mock NextRequest for testing
function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const url = 'http://localhost:3000/api/test';
  const request = new NextRequest(url, {
    method: 'POST',
  });

  // Set headers
  Object.entries(headers).forEach(([key, value]) => {
    request.headers.set(key, value);
  });

  return request as any;
}

describe('RateLimiter', () => {
  beforeEach(() => {
    // Reset time for deterministic tests
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('check()', () => {
    it('allows first request', () => {
      const result = signupLimiter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('allows requests within limit', () => {
      const key = 'test-key-within-limit';
      
      // First request
      const result1 = signupLimiter.check(key);
      expect(result1.allowed).toBe(true);

      // Second request (limit is 3)
      const result2 = signupLimiter.check(key);
      expect(result2.allowed).toBe(true);

      // Third request
      const result3 = signupLimiter.check(key);
      expect(result3.allowed).toBe(true);
    });

    it('blocks requests exceeding limit', () => {
      const key = 'test-key-exceeded';
      
      // Use up the limit (3 requests)
      signupLimiter.check(key);
      signupLimiter.check(key);
      signupLimiter.check(key);

      // Fourth request should be blocked
      const result = signupLimiter.check(key);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('calculates correct retryAfter time', () => {
      const key = 'test-key-retry-after';
      
      // Use up the limit
      signupLimiter.check(key);
      signupLimiter.check(key);
      signupLimiter.check(key);

      // Advance time by 30 minutes (half the window)
      jest.advanceTimersByTime(30 * 60 * 1000);

      // Check retry after
      const result = signupLimiter.check(key);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(30 * 60); // 30 minutes in seconds
    });

    it('resets after window expires', () => {
      const key = 'test-key-reset';
      
      // Use up the limit
      signupLimiter.check(key);
      signupLimiter.check(key);
      signupLimiter.check(key);

      // Verify blocked
      const blockedResult = signupLimiter.check(key);
      expect(blockedResult.allowed).toBe(false);

      // Advance time past the window (1 hour + 1ms)
      jest.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should be allowed again
      const resetResult = signupLimiter.check(key);
      expect(resetResult.allowed).toBe(true);
    });

    it('handles multiple different keys independently', () => {
      const key1 = 'user-1';
      const key2 = 'user-2';
      
      // Use up limit for key1
      signupLimiter.check(key1);
      signupLimiter.check(key1);
      signupLimiter.check(key1);

      // key1 should be blocked
      const result1 = signupLimiter.check(key1);
      expect(result1.allowed).toBe(false);

      // key2 should still be allowed
      const result2 = signupLimiter.check(key2);
      expect(result2.allowed).toBe(true);
    });

    it('handles concurrent requests for same key', () => {
      const key = 'concurrent-key';
      
      // Simulate concurrent requests
      const result1 = loginLimiter.check(key);
      const result2 = loginLimiter.check(key);
      const result3 = loginLimiter.check(key);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(true);
    });
  });

  describe('getIPKey()', () => {
    it('generates key with limiter name and IP', () => {
      const request = createMockRequest({
        'x-forwarded-for': '192.168.1.1',
      });

      const key = loginLimiter.getIPKey(request);
      expect(key).toBe('login:192.168.1.1');
    });

    it('handles X-Forwarded-For header', () => {
      const request = createMockRequest({
        'x-forwarded-for': '203.0.113.1',
      });

      const key = signupLimiter.getIPKey(request);
      expect(key).toBe('signup:203.0.113.1');
    });

    it('handles X-Real-IP header', () => {
      const request = createMockRequest({
        'x-real-ip': '198.51.100.1',
      });

      const key = signupLimiter.getIPKey(request);
      expect(key).toBe('signup:198.51.100.1');
    });

    it('uses fallback when no IP headers present', () => {
      const request = createMockRequest();
      
      const key = signupLimiter.getIPKey(request);
      expect(key).toBe('signup:unknown');
    });
  });

  describe('getUserKey()', () => {
    it('generates key with limiter name and user ID', () => {
      const userId = 'user-123';
      const key = postCreationLimiter.getUserKey(userId);
      expect(key).toBe('post-create:user-123');
    });

    it('handles different user IDs', () => {
      const key1 = commentLimiter.getUserKey('user-abc');
      const key2 = commentLimiter.getUserKey('user-xyz');

      expect(key1).toBe('comment:user-abc');
      expect(key2).toBe('comment:user-xyz');
    });
  });
});

describe('getClientIP()', () => {
  // We need to import the function, but it's not exported
  // So we'll test it through the limiter's getIPKey method
  // which internally uses getClientIP

  it('extracts IP from X-Forwarded-For header', () => {
    const request = createMockRequest({
      'x-forwarded-for': '203.0.113.1, 198.51.100.1, 192.0.2.1',
    });

    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:203.0.113.1');
  });

  it('trims whitespace from X-Forwarded-For IP', () => {
    const request = createMockRequest({
      'x-forwarded-for': '  203.0.113.1  , 198.51.100.1',
    });

    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:203.0.113.1');
  });

  it('falls back to X-Real-IP when X-Forwarded-For is missing', () => {
    const request = createMockRequest({
      'x-real-ip': '198.51.100.1',
    });

    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:198.51.100.1');
  });

  it('trims whitespace from X-Real-IP', () => {
    const request = createMockRequest({
      'x-real-ip': '  198.51.100.1  ',
    });

    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:198.51.100.1');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const request = createMockRequest();
    
    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:unknown');
  });

  it('prefers X-Forwarded-For over X-Real-IP', () => {
    const request = createMockRequest({
      'x-forwarded-for': '203.0.113.1',
      'x-real-ip': '198.51.100.1',
    });

    const key = loginLimiter.getIPKey(request);
    expect(key).toBe('login:203.0.113.1');
  });
});

describe('applyRateLimit()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when request is allowed', () => {
    const key = 'allowed-key';
    const response = applyRateLimit(loginLimiter, key);
    expect(response).toBeNull();
  });

  it('returns 429 response when rate limit exceeded', () => {
    const key = 'exceeded-key';
    
    // Use up the limit
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);

    // Should return 429
    const response = applyRateLimit(loginLimiter, key);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
  });

  it('includes error message in response body', async () => {
    const key = 'error-message-key';
    
    // Exceed limit
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);

    const response = applyRateLimit(loginLimiter, key);
    const body = await response?.json();

    expect(body).toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
  });

  it('includes Retry-After header', () => {
    const key = 'retry-after-key';
    
    // Exceed limit
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);

    const response = applyRateLimit(loginLimiter, key);
    const retryAfter = response?.headers.get('Retry-After');
    
    expect(retryAfter).toBeTruthy();
    expect(parseInt(retryAfter || '0')).toBeGreaterThan(0);
  });

  it('calculates Retry-After based on reset time', () => {
    const key = 'retry-calculation-key';
    
    // Exceed limit
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);
    loginLimiter.check(key);

    // Advance time by 5 minutes
    jest.advanceTimersByTime(5 * 60 * 1000);

    const response = applyRateLimit(loginLimiter, key);
    const retryAfter = response?.headers.get('Retry-After');
    
    // Should be ~10 minutes (15 minute window - 5 minutes elapsed)
    expect(parseInt(retryAfter || '0')).toBeCloseTo(10 * 60, -1);
  });
});

describe('Pre-configured Rate Limiters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('signupLimiter', () => {
    it('has correct limit (3 per hour)', () => {
      const key = 'signup-test';
      
      // Should allow 3 requests
      expect(signupLimiter.check(key).allowed).toBe(true);
      expect(signupLimiter.check(key).allowed).toBe(true);
      expect(signupLimiter.check(key).allowed).toBe(true);
      
      // Should block 4th request
      expect(signupLimiter.check(key).allowed).toBe(false);
    });

    it('has correct window (1 hour)', () => {
      const key = 'signup-window-test';
      
      // Use up limit
      signupLimiter.check(key);
      signupLimiter.check(key);
      signupLimiter.check(key);

      // Advance time by 59 minutes - should still be blocked
      jest.advanceTimersByTime(59 * 60 * 1000);
      expect(signupLimiter.check(key).allowed).toBe(false);

      // Advance time by 2 more minutes - should reset
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(signupLimiter.check(key).allowed).toBe(true);
    });
  });

  describe('loginLimiter', () => {
    it('has correct limit (5 per 15 minutes)', () => {
      const key = 'login-test';
      
      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        expect(loginLimiter.check(key).allowed).toBe(true);
      }
      
      // Should block 6th request
      expect(loginLimiter.check(key).allowed).toBe(false);
    });

    it('has correct window (15 minutes)', () => {
      const key = 'login-window-test';
      
      // Use up limit
      for (let i = 0; i < 5; i++) {
        loginLimiter.check(key);
      }

      // Advance time by 14 minutes - should still be blocked
      jest.advanceTimersByTime(14 * 60 * 1000);
      expect(loginLimiter.check(key).allowed).toBe(false);

      // Advance time by 2 more minutes - should reset
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(loginLimiter.check(key).allowed).toBe(true);
    });
  });

  describe('postCreationLimiter', () => {
    it('has correct limit (10 per hour)', () => {
      const key = 'post-test';
      
      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(postCreationLimiter.check(key).allowed).toBe(true);
      }
      
      // Should block 11th request
      expect(postCreationLimiter.check(key).allowed).toBe(false);
    });
  });

  describe('commentLimiter', () => {
    it('has correct limit (10 per minute)', () => {
      const key = 'comment-test';
      
      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(commentLimiter.check(key).allowed).toBe(true);
      }
      
      // Should block 11th request
      expect(commentLimiter.check(key).allowed).toBe(false);
    });

    it('has correct window (1 minute)', () => {
      const key = 'comment-window-test';
      
      // Use up limit
      for (let i = 0; i < 10; i++) {
        commentLimiter.check(key);
      }

      // Advance time by 59 seconds - should still be blocked
      jest.advanceTimersByTime(59 * 1000);
      expect(commentLimiter.check(key).allowed).toBe(false);

      // Advance time by 2 more seconds - should reset
      jest.advanceTimersByTime(2 * 1000);
      expect(commentLimiter.check(key).allowed).toBe(true);
    });
  });

  describe('cookedEventLimiter', () => {
    it('has correct limit (10 per minute)', () => {
      const key = 'cooked-test';
      
      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(cookedEventLimiter.check(key).allowed).toBe(true);
      }
      
      // Should block 11th request
      expect(cookedEventLimiter.check(key).allowed).toBe(false);
    });
  });

  describe('reactionLimiter', () => {
    it('has correct limit (30 per minute)', () => {
      const key = 'reaction-test';
      
      // Should allow 30 requests
      for (let i = 0; i < 30; i++) {
        expect(reactionLimiter.check(key).allowed).toBe(true);
      }
      
      // Should block 31st request
      expect(reactionLimiter.check(key).allowed).toBe(false);
    });
  });
});
