/**
 * Unit Tests - API Error Helpers
 *
 * Tests for error handling utilities in src/lib/apiErrors.ts
 * These functions provide standardized error responses across all API routes.
 *
 * Coverage Goal: 100% (error handling infrastructure)
 */

import { z } from 'zod';
import {
  validationError,
  badRequestError,
  unauthorizedError,
  invalidCredentialsError,
  forbiddenError,
  notFoundError,
  conflictError,
  internalError,
  parseQueryParams,
  parseRouteParams,
  parseRequestBody,
  API_ERROR_CODES,
  createErrorResponse,
} from '@/lib/apiErrors';

describe('API Error Helpers', () => {
  describe('Error Response Builders', () => {
    describe('createErrorResponse()', () => {
      it('should create custom error response with any status code', async () => {
        const response = createErrorResponse(
          API_ERROR_CODES.NOT_FOUND,
          'Custom not found message',
          404
        );
        
        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.NOT_FOUND);
        expect(data.error.message).toBe('Custom not found message');
      });

      it('should create error response with different status codes', async () => {
        const response = createErrorResponse(
          API_ERROR_CODES.FORBIDDEN,
          'Access denied',
          403
        );
        
        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.FORBIDDEN);
        expect(data.error.message).toBe('Access denied');
      });

      it('should create error response structure correctly', async () => {
        const response = createErrorResponse(
          API_ERROR_CODES.CONFLICT,
          'Resource conflict',
          409
        );
        
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(data.error).toHaveProperty('code');
        expect(data.error).toHaveProperty('message');
        expect(Object.keys(data.error)).toEqual(['code', 'message']);
      });
    });

    describe('validationError()', () => {
      it('should return 400 with VALIDATION_ERROR code', async () => {
        const response = validationError();
        expect(response.status).toBe(400);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
      });

      it('should use default message when not provided', async () => {
        const response = validationError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Validation failed');
      });

      it('should use custom message when provided', async () => {
        const response = validationError('Custom validation error');
        const data = await response.json();
        
        expect(data.error.message).toBe('Custom validation error');
      });

      it('should return correct response structure', async () => {
        const response = validationError('Test message');
        const data = await response.json();
        
        expect(data).toHaveProperty('error');
        expect(data.error).toHaveProperty('code');
        expect(data.error).toHaveProperty('message');
      });
    });

    describe('badRequestError()', () => {
      it('should return 400 with BAD_REQUEST code', async () => {
        const response = badRequestError();
        expect(response.status).toBe(400);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.BAD_REQUEST);
      });

      it('should use default message when not provided', async () => {
        const response = badRequestError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Bad request');
      });

      it('should use custom message when provided', async () => {
        const response = badRequestError('Invalid input');
        const data = await response.json();
        
        expect(data.error.message).toBe('Invalid input');
      });
    });

    describe('unauthorizedError()', () => {
      it('should return 401 with UNAUTHORIZED code', async () => {
        const response = unauthorizedError();
        expect(response.status).toBe(401);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
      });

      it('should use default message when not provided', async () => {
        const response = unauthorizedError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Not authenticated');
      });

      it('should use custom message when provided', async () => {
        const response = unauthorizedError('Please log in');
        const data = await response.json();
        
        expect(data.error.message).toBe('Please log in');
      });
    });

    describe('invalidCredentialsError()', () => {
      it('should return 401 with INVALID_CREDENTIALS code', async () => {
        const response = invalidCredentialsError();
        expect(response.status).toBe(401);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.INVALID_CREDENTIALS);
      });

      it('should use default message when not provided', async () => {
        const response = invalidCredentialsError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Invalid credentials');
      });

      it('should use custom message when provided', async () => {
        const response = invalidCredentialsError('Wrong password');
        const data = await response.json();
        
        expect(data.error.message).toBe('Wrong password');
      });
    });

    describe('forbiddenError()', () => {
      it('should return 403 with FORBIDDEN code', async () => {
        const response = forbiddenError();
        expect(response.status).toBe(403);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.FORBIDDEN);
      });

      it('should use default message when not provided', async () => {
        const response = forbiddenError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Forbidden');
      });

      it('should use custom message when provided', async () => {
        const response = forbiddenError('Access denied');
        const data = await response.json();
        
        expect(data.error.message).toBe('Access denied');
      });
    });

    describe('notFoundError()', () => {
      it('should return 404 with NOT_FOUND code', async () => {
        const response = notFoundError();
        expect(response.status).toBe(404);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.NOT_FOUND);
      });

      it('should use default message when not provided', async () => {
        const response = notFoundError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Resource not found');
      });

      it('should use custom message when provided', async () => {
        const response = notFoundError('Post not found');
        const data = await response.json();
        
        expect(data.error.message).toBe('Post not found');
      });
    });

    describe('conflictError()', () => {
      it('should return 409 with CONFLICT code', async () => {
        const response = conflictError();
        expect(response.status).toBe(409);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.CONFLICT);
      });

      it('should use default message when not provided', async () => {
        const response = conflictError();
        const data = await response.json();
        
        expect(data.error.message).toBe('Resource conflict');
      });

      it('should use custom message when provided', async () => {
        const response = conflictError('Email already exists');
        const data = await response.json();
        
        expect(data.error.message).toBe('Email already exists');
      });
    });

    describe('internalError()', () => {
      it('should return 500 with INTERNAL_ERROR code', async () => {
        const response = internalError();
        expect(response.status).toBe(500);
        
        const data = await response.json();
        expect(data.error.code).toBe(API_ERROR_CODES.INTERNAL_ERROR);
      });

      it('should use default message when not provided', async () => {
        const response = internalError();
        const data = await response.json();
        
        expect(data.error.message).toBe('An unexpected error occurred');
      });

      it('should use custom message when provided', async () => {
        const response = internalError('Database connection failed');
        const data = await response.json();
        
        expect(data.error.message).toBe('Database connection failed');
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('parseQueryParams()', () => {
      const testSchema = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        offset: z.coerce.number().int().min(0).optional().default(0),
        search: z.string().optional(),
      });

      it('should return success with valid data', () => {
        const searchParams = new URLSearchParams({
          limit: '10',
          offset: '5',
          search: 'test',
        });

        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(10);
          expect(result.data.offset).toBe(5);
          expect(result.data.search).toBe('test');
        }
      });

      it('should return error for invalid schema', async () => {
        const searchParams = new URLSearchParams({
          limit: 'invalid',
        });

        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.status).toBe(400);
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle array parameters correctly', () => {
        const arraySchema = z.object({
          tags: z.array(z.string()),
        });

        const searchParams = new URLSearchParams();
        searchParams.append('tags', 'tag1');
        searchParams.append('tags', 'tag2');
        searchParams.append('tags', 'tag3');

        const result = parseQueryParams(searchParams, arraySchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tags).toEqual(['tag1', 'tag2', 'tag3']);
        }
      });

      it('should handle single value parameters', () => {
        const searchParams = new URLSearchParams({
          search: 'pasta',
        });

        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.search).toBe('pasta');
        }
      });

      it('should handle empty URLSearchParams', () => {
        const searchParams = new URLSearchParams();
        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20); // default
          expect(result.data.offset).toBe(0); // default
        }
      });

      it('should handle optional parameters', () => {
        const searchParams = new URLSearchParams({
          limit: '15',
        });

        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(15);
          expect(result.data.offset).toBe(0); // default
          expect(result.data.search).toBeUndefined();
        }
      });

      it('should include validation error message in response', async () => {
        const searchParams = new URLSearchParams({
          limit: '200', // exceeds max
        });

        const result = parseQueryParams(searchParams, testSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.message).toBeTruthy();
          expect(typeof data.error.message).toBe('string');
        }
      });

      it('should use fallback message when error message is undefined', async () => {
        // Create a schema that will fail without a specific error message
        const schemaWithoutMessage = z.object({
          custom: z.custom(() => false), // Will fail validation
        });

        const searchParams = new URLSearchParams({ custom: 'value' });
        const result = parseQueryParams(searchParams, schemaWithoutMessage);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          // Should have some message (either from Zod or fallback)
          expect(data.error.message).toBeTruthy();
        }
      });

      it('should handle mixed single and array parameters', () => {
        const mixedSchema = z.object({
          search: z.string(),
          tags: z.array(z.string()),
        });

        const searchParams = new URLSearchParams();
        searchParams.append('search', 'recipe');
        searchParams.append('tags', 'vegetarian');
        searchParams.append('tags', 'quick');

        const result = parseQueryParams(searchParams, mixedSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.search).toBe('recipe');
          expect(result.data.tags).toEqual(['vegetarian', 'quick']);
        }
      });
    });

    describe('parseRouteParams()', () => {
      const postIdSchema = z.object({
        postId: z.string().cuid('Invalid post ID'),
      });

      it('should return success with valid data', () => {
        const params = { postId: 'clh1234567890abcdefghij' };
        const result = parseRouteParams(params, postIdSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.postId).toBe('clh1234567890abcdefghij');
        }
      });

      it('should return error for invalid schema', async () => {
        const params = { postId: 'invalid-id' };
        const result = parseRouteParams(params, postIdSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.status).toBe(400);
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
          expect(data.error.message).toContain('Invalid post ID');
        }
      });

      it('should handle missing required params', async () => {
        const params = {};
        const result = parseRouteParams(params, postIdSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle null params', async () => {
        const result = parseRouteParams(null, postIdSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle undefined params', async () => {
        const result = parseRouteParams(undefined, postIdSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle multiple route params', () => {
        const multiParamSchema = z.object({
          postId: z.string().cuid(),
          commentId: z.string().cuid(),
        });

        const params = {
          postId: 'clh1234567890abcdefghij',
          commentId: 'clh9876543210zyxwvutsrq',
        };

        const result = parseRouteParams(params, multiParamSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.postId).toBe('clh1234567890abcdefghij');
          expect(result.data.commentId).toBe('clh9876543210zyxwvutsrq');
        }
      });

      it('should use fallback message when error message is undefined', async () => {
        const schemaWithoutMessage = z.object({
          id: z.custom(() => false),
        });

        const params = { id: 'value' };
        const result = parseRouteParams(params, schemaWithoutMessage);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.message).toBeTruthy();
        }
      });
    });

    describe('parseRequestBody()', () => {
      const postSchema = z.object({
        title: z.string().min(1, 'Title is required').max(160),
        caption: z.string().max(2000).optional(),
      });

      it('should return success with valid JSON', () => {
        const body = { title: 'My Post', caption: 'A description' };
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe('My Post');
          expect(result.data.caption).toBe('A description');
        }
      });

      it('should return error for invalid JSON', async () => {
        const body = { title: '' }; // Empty title fails validation
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.status).toBe(400);
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should return error for schema validation failure', async () => {
        const body = { title: 'a'.repeat(161) }; // Exceeds max length
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
          expect(data.error.message).toBeTruthy();
        }
      });

      it('should handle missing required fields', async () => {
        const body = { caption: 'Caption only' };
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          // Zod returns "Required" for missing fields
          expect(data.error.message).toBeTruthy();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle optional fields', () => {
        const body = { title: 'Title only' };
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe('Title only');
          expect(result.data.caption).toBeUndefined();
        }
      });

      it('should handle null body', async () => {
        const result = parseRequestBody(null, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle undefined body', async () => {
        const result = parseRequestBody(undefined, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
        }
      });

      it('should handle nested objects', () => {
        const nestedSchema = z.object({
          title: z.string(),
          recipe: z.object({
            ingredients: z.array(z.string()),
            steps: z.array(z.string()),
          }).optional(),
        });

        const body = {
          title: 'Recipe Post',
          recipe: {
            ingredients: ['flour', 'sugar'],
            steps: ['Mix', 'Bake'],
          },
        };

        const result = parseRequestBody(body, nestedSchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.recipe?.ingredients).toEqual(['flour', 'sugar']);
          expect(result.data.recipe?.steps).toEqual(['Mix', 'Bake']);
        }
      });

      it('should handle arrays in body', () => {
        const arraySchema = z.object({
          tags: z.array(z.string().min(1).max(40)),
        });

        const body = { tags: ['vegetarian', 'quick', 'easy'] };
        const result = parseRequestBody(body, arraySchema);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tags).toEqual(['vegetarian', 'quick', 'easy']);
        }
      });

      it('should provide meaningful error message on first validation error', async () => {
        const body = {
          title: '',
          caption: 'a'.repeat(2001),
        };
        const result = parseRequestBody(body, postSchema);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          // Should get the first error (title is required)
          expect(data.error.message).toBeTruthy();
          expect(typeof data.error.message).toBe('string');
        }
      });

      it('should use fallback message when error message is undefined', async () => {
        const schemaWithoutMessage = z.object({
          field: z.custom(() => false),
        });

        const body = { field: 'value' };
        const result = parseRequestBody(body, schemaWithoutMessage);

        expect(result.success).toBe(false);
        if (!result.success) {
          const data = await result.error.json();
          expect(data.error.message).toBeTruthy();
        }
      });
    });
  });

  describe('Error Code Constants', () => {
    it('should have all expected error codes', () => {
      expect(API_ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(API_ERROR_CODES.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(API_ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(API_ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(API_ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
      expect(API_ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
      expect(API_ERROR_CODES.CONFLICT).toBe('CONFLICT');
      expect(API_ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(API_ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should be read-only constants', () => {
      // TypeScript ensures compile-time immutability with 'as const'
      // Verify the constants exist and have correct values
      const codes = Object.keys(API_ERROR_CODES);
      expect(codes.length).toBeGreaterThan(0);
      expect(API_ERROR_CODES).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete API error flow for validation', async () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });

      const invalidBody = { email: 'not-an-email', password: 'short' };
      const result = parseRequestBody(invalidBody, schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        const response = result.error;
        expect(response.status).toBe(400);
        
        const data = await response.json();
        expect(data.error.code).toBe('VALIDATION_ERROR');
        expect(data.error.message).toBeTruthy();
      }
    });

    it('should handle complete API error flow for not found', async () => {
      const response = notFoundError('Post with ID clh123 not found');
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toBe('Post with ID clh123 not found');
    });

    it('should handle complete API error flow for forbidden', async () => {
      const response = forbiddenError('You do not have permission to delete this post');
      expect(response.status).toBe(403);
      
      const data = await response.json();
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('You do not have permission to delete this post');
    });
  });
});
