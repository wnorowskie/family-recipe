import { LRUCache } from 'lru-cache';
import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  uniqueName: string;
  limit: number;
  windowMs: number;
  maxCacheSize?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Simple in-memory rate limiter using LRU cache.
 * Suitable for single-instance deployments (like we will use via Vercel).
 * If the system ever gets scaled to multiple instances, I will have to use a shared store (Redis).
 */
class RateLimiter {
  private cache: LRUCache<string, RateLimitEntry>;
  private limit: number;
  private windowMs: number;
  private name: string;

  constructor(options: RateLimitOptions) {
    this.name = options.uniqueName;
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.cache = new LRUCache<string, RateLimitEntry>({
      max: options.maxCacheSize ?? 500,
      ttl: options.windowMs,
    });
  }

  /**
   * Check if the request is allowed.
   * Returns { allowed: boolean, retryAfter?: number }
   */
  check(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry || now > entry.resetTime) {
      // First request or window expired
      this.cache.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return { allowed: true };
    }

    if (entry.count < this.limit) {
      // Within limit
      entry.count += 1;
      this.cache.set(key, entry);
      return { allowed: true };
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  /**
   * Get the rate limit key for the request.
   * For IP-based limiting (login/signup).
   */
  getIPKey(request: NextRequest): string {
    const ip = getClientIP(request);
    return `${this.name}:${ip}`;
  }

  /**
   * Get the rate limit key for the request.
   * For user-based limiting (authenticated endpoints).
   */
  getUserKey(userId: string): string {
    return `${this.name}:${userId}`;
  }
}

/**
 * Extract the real client IP address from the request.
 * Handles proxies, CDNs, and Vercel deployment.
 * DevSecOps best practice: trust X-Forwarded-For (first IP), fallback to X-Real-IP.
 */
function getClientIP(request: NextRequest): string {
  // X-Forwarded-For header (comma-separated list, first is the client)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // X-Real-IP header (single IP)
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  // Fallback to connection IP (may not be available in all environments)
  return request.ip ?? 'unknown';
}

/**
 * Apply rate limiting to a request.
 * Returns a 429 response if rate limit is exceeded.
 */
export function applyRateLimit(
  limiter: RateLimiter,
  key: string
): NextResponse | null {
  const { allowed, retryAfter } = limiter.check(key);

  if (!allowed) {
    const response = NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      },
      { status: 429 }
    );

    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter.toString());
    }

    return response;
  }

  return null;
}

// Pre-configured rate limiters for different endpoints

/**
 * Signup rate limiter: 3 attempts per IP per hour
 */
export const signupLimiter = new RateLimiter({
  uniqueName: 'signup',
  limit: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
  maxCacheSize: 500,
});

/**
 * Login rate limiter: 5 attempts per IP per 15 minutes
 */
export const loginLimiter = new RateLimiter({
  uniqueName: 'login',
  limit: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxCacheSize: 500,
});

/**
 * Post creation rate limiter: 10 posts per user per hour
 */
export const postCreationLimiter = new RateLimiter({
  uniqueName: 'post-create',
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  maxCacheSize: 500,
});

/**
 * Comment creation rate limiter: 10 comments per user per minute
 */
export const commentLimiter = new RateLimiter({
  uniqueName: 'comment',
  limit: 10,
  windowMs: 60 * 1000, // 1 minute
  maxCacheSize: 500,
});

/**
 * Cooked event rate limiter: 10 events per user per minute
 */
export const cookedEventLimiter = new RateLimiter({
  uniqueName: 'cooked',
  limit: 10,
  windowMs: 60 * 1000, // 1 minute
  maxCacheSize: 500,
});

/**
 * Reaction rate limiter: 30 reactions per user per minute
 */
export const reactionLimiter = new RateLimiter({
  uniqueName: 'reaction',
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  maxCacheSize: 500,
});

/**
 * Feedback submissions: 10 submissions per user/email per hour
 */
export const feedbackLimiter = new RateLimiter({
  uniqueName: 'feedback',
  limit: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  maxCacheSize: 500,
});
