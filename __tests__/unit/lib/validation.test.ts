/**
 * Unit Tests - Validation Schemas
 *
 * Tests for Zod validation schemas in src/lib/validation.ts
 * These schemas validate all user input across API routes.
 *
 * Coverage Goal: 90%+ (comprehensive validation testing)
 */

import {
  paginationSchema,
  recipeFiltersSchema,
  postIdParamSchema,
  commentIdParamSchema,
  userIdParamSchema,
  createPostSchema,
  createCommentSchema,
  reactionSchema,
  cookedEventSchema,
  signupSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  recipeDetailsSchema,
  resetPasswordSchema,
  deleteAccountSchema,
} from '@/lib/validation';

describe('Validation Schemas', () => {
  describe('Pagination Schema', () => {
    it('should accept valid limit and offset', () => {
      const result = paginationSchema.safeParse({ limit: 10, offset: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });

    it('should set default limit=20 when not provided', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it('should set default offset=0 when not provided', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(0);
      }
    });

    it('should coerce string numbers to integers', () => {
      const result = paginationSchema.safeParse({ limit: '15', offset: '10' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(15);
        expect(result.data.offset).toBe(10);
        expect(typeof result.data.limit).toBe('number');
        expect(typeof result.data.offset).toBe('number');
      }
    });

    it('should reject limit < 1', () => {
      const result = paginationSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 1');
      }
    });

    it('should reject limit > 100', () => {
      const result = paginationSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cannot exceed 100');
      }
    });

    it('should reject negative offset', () => {
      const result = paginationSchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cannot be negative');
      }
    });

    it('should reject non-numeric values', () => {
      const result = paginationSchema.safeParse({
        limit: 'abc',
        offset: 'xyz',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('should accept only offset without limit', () => {
      const result = paginationSchema.safeParse({ offset: 10 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20); // default
        expect(result.data.offset).toBe(10);
      }
    });

    it('should accept only limit without offset', () => {
      const result = paginationSchema.safeParse({ limit: 50 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0); // default
      }
    });

    it('should accept boundary values (limit=1, offset=0)', () => {
      const result = paginationSchema.safeParse({ limit: 1, offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should accept boundary values (limit=100)', () => {
      const result = paginationSchema.safeParse({ limit: 100 });
      expect(result.success).toBe(true);
    });
  });

  describe('Recipe Filters Schema', () => {
    it('should accept valid search query', () => {
      const result = recipeFiltersSchema.safeParse({ search: 'pasta' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('pasta');
      }
    });

    it('should reject search query > 200 chars', () => {
      const longQuery = 'a'.repeat(201);
      const result = recipeFiltersSchema.safeParse({ search: longQuery });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('should accept valid course array', () => {
      const result = recipeFiltersSchema.safeParse({
        course: ['breakfast', 'dinner'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.course).toEqual(['breakfast', 'dinner']);
      }
    });

    it('should deduplicate course values', () => {
      const result = recipeFiltersSchema.safeParse({
        course: ['breakfast', 'breakfast', 'dinner'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.course).toEqual(['breakfast', 'dinner']);
      }
    });

    it('should reject invalid course enum values', () => {
      const result = recipeFiltersSchema.safeParse({
        course: ['invalid_course'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid tags array', () => {
      const result = recipeFiltersSchema.safeParse({
        tags: ['vegetarian', 'quick'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual(['vegetarian', 'quick']);
      }
    });

    it('should reject tags array with >10 items', () => {
      const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      const result = recipeFiltersSchema.safeParse({ tags: tooManyTags });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Too many tags');
      }
    });

    it('should accept valid difficulty array', () => {
      const result = recipeFiltersSchema.safeParse({
        difficulty: ['easy', 'medium'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.difficulty).toEqual(['easy', 'medium']);
      }
    });

    it('should deduplicate difficulty values', () => {
      const result = recipeFiltersSchema.safeParse({
        difficulty: ['easy', 'easy', 'hard'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.difficulty).toEqual(['easy', 'hard']);
      }
    });

    it('should accept valid time range (min/max)', () => {
      const result = recipeFiltersSchema.safeParse({
        totalTimeMin: 10,
        totalTimeMax: 60,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalTimeMin).toBe(10);
        expect(result.data.totalTimeMax).toBe(60);
      }
    });

    it('should reject minTime > maxTime', () => {
      const result = recipeFiltersSchema.safeParse({
        totalTimeMin: 60,
        totalTimeMax: 10,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'Minimum total time cannot be greater than maximum'
        );
      }
    });

    it('should accept valid servings range (min/max)', () => {
      const result = recipeFiltersSchema.safeParse({
        servingsMin: 2,
        servingsMax: 8,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.servingsMin).toBe(2);
        expect(result.data.servingsMax).toBe(8);
      }
    });

    it('should reject minServings > maxServings', () => {
      const result = recipeFiltersSchema.safeParse({
        servingsMin: 8,
        servingsMax: 2,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'Minimum servings cannot be greater than maximum'
        );
      }
    });

    it('should accept valid ingredients array (≤5 items)', () => {
      const result = recipeFiltersSchema.safeParse({
        ingredients: ['flour', 'sugar', 'eggs'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ingredients).toHaveLength(3);
      }
    });

    it('should reject ingredients array with >5 items', () => {
      const tooManyIngredients = ['a', 'b', 'c', 'd', 'e', 'f'];
      const result = recipeFiltersSchema.safeParse({
        ingredients: tooManyIngredients,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'Maximum 5 ingredients'
        );
      }
    });

    it('should accept valid sort option (recent)', () => {
      const result = recipeFiltersSchema.safeParse({ sort: 'recent' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('recent');
      }
    });

    it('should accept valid sort option (alpha)', () => {
      const result = recipeFiltersSchema.safeParse({ sort: 'alpha' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('alpha');
      }
    });

    it('should reject invalid sort option', () => {
      const result = recipeFiltersSchema.safeParse({ sort: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('recent');
      }
    });

    it('should default to recent sort when not provided', () => {
      const result = recipeFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe('recent');
      }
    });

    it('should accept equal min and max time', () => {
      const result = recipeFiltersSchema.safeParse({
        totalTimeMin: 30,
        totalTimeMax: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should accept equal min and max servings', () => {
      const result = recipeFiltersSchema.safeParse({
        servingsMin: 4,
        servingsMax: 4,
      });
      expect(result.success).toBe(true);
    });

    it('should combine multiple filters', () => {
      const result = recipeFiltersSchema.safeParse({
        search: 'pasta',
        course: ['dinner'],
        difficulty: ['easy'],
        totalTimeMin: 10,
        totalTimeMax: 30,
        servingsMin: 2,
        servingsMax: 4,
        ingredients: ['tomato', 'basil'],
        sort: 'alpha',
        limit: 10,
        offset: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Param Schemas', () => {
    describe('postIdParamSchema', () => {
      it('should accept valid CUID', () => {
        const result = postIdParamSchema.safeParse({
          postId: 'clh1234567890abcdefghij',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid format', () => {
        const result = postIdParamSchema.safeParse({ postId: 'invalid-id' });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('Invalid post ID');
        }
      });

      it('should reject empty string', () => {
        const result = postIdParamSchema.safeParse({ postId: '' });
        expect(result.success).toBe(false);
      });

      it('should reject missing postId', () => {
        const result = postIdParamSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });

    describe('commentIdParamSchema', () => {
      it('should accept valid CUID', () => {
        const result = commentIdParamSchema.safeParse({
          commentId: 'clh1234567890abcdefghij',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid format', () => {
        const result = commentIdParamSchema.safeParse({
          commentId: 'not-a-cuid',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'Invalid comment ID'
          );
        }
      });
    });

    describe('userIdParamSchema', () => {
      it('should accept valid CUID', () => {
        const result = userIdParamSchema.safeParse({
          userId: 'clh1234567890abcdefghij',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid format', () => {
        const result = userIdParamSchema.safeParse({ userId: '12345' });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('Invalid user ID');
        }
      });
    });
  });

  describe('Post Schemas', () => {
    describe('createPostSchema', () => {
      it('should require title', () => {
        const result = createPostSchema.safeParse({ caption: 'A caption' });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('title');
        }
      });

      it('should accept basic post without recipe', () => {
        const result = createPostSchema.safeParse({
          title: 'My Post',
          caption: 'A simple post',
        });
        expect(result.success).toBe(true);
      });

      it('should accept post with optional recipe details', () => {
        const result = createPostSchema.safeParse({
          title: 'My Recipe',
          caption: 'Delicious',
          recipe: {
            ingredients: [{ name: 'flour', quantity: 2, unit: 'cup' }],
            steps: [{ text: 'Mix ingredients' }],
          },
        });
        expect(result.success).toBe(true);
      });

      it('should validate recipe ingredients format', () => {
        const result = createPostSchema.safeParse({
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: '', quantity: 2, unit: 'cup' }],
            steps: [{ text: 'Mix' }],
          },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('required');
        }
      });

      it('should validate recipe steps format', () => {
        const result = createPostSchema.safeParse({
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'flour', quantity: 2, unit: 'cup' }],
            steps: [{ text: '' }],
          },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('required');
        }
      });

      it('should reject title longer than 160 chars', () => {
        const longTitle = 'a'.repeat(161);
        const result = createPostSchema.safeParse({ title: longTitle });
        expect(result.success).toBe(false);
      });

      it('should reject caption longer than 2000 chars', () => {
        const longCaption = 'a'.repeat(2001);
        const result = createPostSchema.safeParse({
          title: 'Title',
          caption: longCaption,
        });
        expect(result.success).toBe(false);
      });

      it('should accept empty caption', () => {
        const result = createPostSchema.safeParse({
          title: 'Title',
          caption: '',
        });
        expect(result.success).toBe(true);
      });

      it('should accept post without caption', () => {
        const result = createPostSchema.safeParse({ title: 'Title' });
        expect(result.success).toBe(true);
      });
    });

    describe('recipeDetailsSchema', () => {
      it('should validate course enum', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          course: 'invalid',
        });
        expect(result.success).toBe(false);
      });

      it('should accept valid course enum', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          course: 'dinner',
        });
        expect(result.success).toBe(true);
      });

      it('should validate difficulty enum', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          difficulty: 'invalid',
        });
        expect(result.success).toBe(false);
      });

      it('should accept valid difficulty enum', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          difficulty: 'easy',
        });
        expect(result.success).toBe(true);
      });

      it('should require at least one ingredient', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [],
          steps: [{ text: 'Mix' }],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'At least one ingredient'
          );
        }
      });

      it('should require at least one step', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('At least one step');
        }
      });

      it('should accept up to 50 ingredients', () => {
        const ingredients = Array.from({ length: 50 }, (_, i) => ({
          name: `ingredient${i}`,
          unit: 'cup' as const,
        }));
        const result = recipeDetailsSchema.safeParse({
          ingredients,
          steps: [{ text: 'Mix' }],
        });
        expect(result.success).toBe(true);
      });

      it('should reject more than 50 ingredients', () => {
        const ingredients = Array.from({ length: 51 }, (_, i) => ({
          name: `ingredient${i}`,
          unit: 'cup' as const,
        }));
        const result = recipeDetailsSchema.safeParse({
          ingredients,
          steps: [{ text: 'Mix' }],
        });
        expect(result.success).toBe(false);
      });

      it('should accept up to 50 steps', () => {
        const steps = Array.from({ length: 50 }, (_, i) => ({
          text: `Step ${i}`,
        }));
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps,
        });
        expect(result.success).toBe(true);
      });

      it('should reject more than 50 steps', () => {
        const steps = Array.from({ length: 51 }, (_, i) => ({
          text: `Step ${i}`,
        }));
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps,
        });
        expect(result.success).toBe(false);
      });

      it('should accept optional fields (origin, totalTime, servings)', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          origin: 'Italy',
          totalTime: 30,
          servings: 4,
        });
        expect(result.success).toBe(true);
      });

      it('should validate positive totalTime', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          totalTime: -5,
        });
        expect(result.success).toBe(false);
      });

      it('should validate positive servings', () => {
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          servings: 0,
        });
        expect(result.success).toBe(false);
      });

      it('should accept up to 10 tags', () => {
        const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          tags,
        });
        expect(result.success).toBe(true);
      });

      it('should reject more than 10 tags', () => {
        const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
        const result = recipeDetailsSchema.safeParse({
          ingredients: [{ name: 'flour', unit: 'cup' }],
          steps: [{ text: 'Mix' }],
          tags,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Comment Schema', () => {
    it('should require content', () => {
      const result = createCommentSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('text');
      }
    });

    it('should reject empty content', () => {
      const result = createCommentSchema.safeParse({ text: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should accept valid comment text', () => {
      const result = createCommentSchema.safeParse({ text: 'Great recipe!' });
      expect(result.success).toBe(true);
    });

    it('should reject text longer than 2000 chars', () => {
      const longText = 'a'.repeat(2001);
      const result = createCommentSchema.safeParse({ text: longText });
      expect(result.success).toBe(false);
    });

    it('should accept text exactly 2000 chars', () => {
      const maxText = 'a'.repeat(2000);
      const result = createCommentSchema.safeParse({ text: maxText });
      expect(result.success).toBe(true);
    });
  });

  describe('Reaction Schema', () => {
    it('should require emoji', () => {
      const result = reactionSchema.safeParse({
        targetType: 'post',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('emoji');
      }
    });

    it('should require targetType (post/comment)', () => {
      const result = reactionSchema.safeParse({
        emoji: '👍',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('targetType');
      }
    });

    it('should require targetId', () => {
      const result = reactionSchema.safeParse({
        emoji: '👍',
        targetType: 'post',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('targetId');
      }
    });

    it('should accept valid reaction for post', () => {
      const result = reactionSchema.safeParse({
        emoji: '👍',
        targetType: 'post',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid reaction for comment', () => {
      const result = reactionSchema.safeParse({
        emoji: '❤️',
        targetType: 'comment',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid targetType', () => {
      const result = reactionSchema.safeParse({
        emoji: '👍',
        targetType: 'invalid',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(false);
    });

    it('should reject emoji longer than 4 chars', () => {
      const result = reactionSchema.safeParse({
        emoji: '👍👍👍👍👍',
        targetType: 'post',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty emoji', () => {
      const result = reactionSchema.safeParse({
        emoji: '',
        targetType: 'post',
        targetId: 'clh1234567890abcdefghij',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Cooked Event Schema', () => {
    it('should accept valid rating (1-5)', () => {
      for (let rating = 1; rating <= 5; rating++) {
        const result = cookedEventSchema.safeParse({ rating });
        expect(result.success).toBe(true);
      }
    });

    it('should reject rating < 1', () => {
      const result = cookedEventSchema.safeParse({ rating: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 1');
      }
    });

    it('should reject rating > 5', () => {
      const result = cookedEventSchema.safeParse({ rating: 6 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'cannot be more than 5'
        );
      }
    });

    it('should accept optional note', () => {
      const result = cookedEventSchema.safeParse({
        rating: 5,
        note: 'Delicious!',
      });
      expect(result.success).toBe(true);
    });

    it('should accept rating without note', () => {
      const result = cookedEventSchema.safeParse({ rating: 4 });
      expect(result.success).toBe(true);
    });

    it('should accept note without rating (rating is optional)', () => {
      const result = cookedEventSchema.safeParse({ note: 'Tried this today' });
      expect(result.success).toBe(true);
    });

    it('should reject note longer than 1000 chars', () => {
      const longNote = 'a'.repeat(1001);
      const result = cookedEventSchema.safeParse({ rating: 5, note: longNote });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1000 characters');
      }
    });

    it('should accept note exactly 1000 chars', () => {
      const maxNote = 'a'.repeat(1000);
      const result = cookedEventSchema.safeParse({ rating: 5, note: maxNote });
      expect(result.success).toBe(true);
    });

    it('should reject decimal ratings', () => {
      const result = cookedEventSchema.safeParse({ rating: 3.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('whole number');
      }
    });

    it('should accept empty object (all fields optional)', () => {
      const result = cookedEventSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('Auth Schemas', () => {
    describe('signupSchema', () => {
      it('should require all fields', () => {
        const result = signupSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(0);
        }
      });

      it('should accept valid signup data', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
          password: 'password123',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(true);
      });

      it('should require name', () => {
        const result = signupSchema.safeParse({
          email: 'john@example.com',
          username: 'johnny',
          password: 'password123',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(false);
      });

      it('should require password at least 8 characters', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
          password: 'short',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'at least 8 characters'
          );
        }
      });

      it('should require username', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(false);
      });

      it('should require email', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          username: 'johnny',
          password: 'password123',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(false);
      });

      it('should require familyMasterKey', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
          password: 'password123',
        });
        expect(result.success).toBe(false);
      });

      it('should default rememberMe to false', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
          password: 'password123',
          familyMasterKey: 'secret-key',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.rememberMe).toBe(false);
        }
      });

      it('should accept rememberMe as true', () => {
        const result = signupSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
          password: 'password123',
          familyMasterKey: 'secret-key',
          rememberMe: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.rememberMe).toBe(true);
        }
      });
    });

    describe('loginSchema', () => {
      it('should require emailOrUsername', () => {
        const result = loginSchema.safeParse({ password: 'password123' });
        expect(result.success).toBe(false);
      });

      it('should require password', () => {
        const result = loginSchema.safeParse({
          emailOrUsername: 'john@example.com',
        });
        expect(result.success).toBe(false);
      });

      it('should accept valid login data', () => {
        const result = loginSchema.safeParse({
          emailOrUsername: 'john@example.com',
          password: 'password123',
        });
        expect(result.success).toBe(true);
      });

      it('should default rememberMe to false', () => {
        const result = loginSchema.safeParse({
          emailOrUsername: 'john@example.com',
          password: 'password123',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.rememberMe).toBe(false);
        }
      });
    });

    describe('updateProfileSchema', () => {
      it('should require name', () => {
        const result = updateProfileSchema.safeParse({
          email: 'john@example.com',
          username: 'johnny',
        });
        expect(result.success).toBe(false);
      });

      it('should require email and username', () => {
        const result = updateProfileSchema.safeParse({ name: 'John Doe' });
        expect(result.success).toBe(false);
      });

      it('should accept valid profile data', () => {
        const result = updateProfileSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'johnny',
        });
        expect(result.success).toBe(true);
      });

      it('should reject name longer than 100 chars', () => {
        const longName = 'a'.repeat(101);
        const result = updateProfileSchema.safeParse({
          name: longName,
          email: 'john@example.com',
          username: 'johnny',
        });
        expect(result.success).toBe(false);
      });

      it('should reject email longer than 200 chars', () => {
        const longEmail = 'a'.repeat(201) + '@example.com';
        const result = updateProfileSchema.safeParse({
          name: 'John Doe',
          email: longEmail,
          username: 'johnny',
        });
        expect(result.success).toBe(false);
      });

      it('should reject username shorter than 3 chars', () => {
        const result = updateProfileSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'ab',
        });
        expect(result.success).toBe(false);
      });

      it('should reject username with invalid characters', () => {
        const result = updateProfileSchema.safeParse({
          name: 'John Doe',
          email: 'john@example.com',
          username: 'john doe',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('changePasswordSchema', () => {
      it('should require currentPassword', () => {
        const result = changePasswordSchema.safeParse({
          newPassword: 'newpassword123',
        });
        expect(result.success).toBe(false);
      });

      it('should require newPassword', () => {
        const result = changePasswordSchema.safeParse({
          currentPassword: 'oldpassword123',
        });
        expect(result.success).toBe(false);
      });

      it('should require newPassword at least 8 characters', () => {
        const result = changePasswordSchema.safeParse({
          currentPassword: 'oldpassword123',
          newPassword: 'short',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'at least 8 characters'
          );
        }
      });

      it('should accept valid password change data', () => {
        const result = changePasswordSchema.safeParse({
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('resetPasswordSchema', () => {
      it('requires all fields', () => {
        const result = resetPasswordSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('accepts valid input', () => {
        const result = resetPasswordSchema.safeParse({
          email: 'john@example.com',
          masterKey: 'family-key',
          newPassword: 'newpassword123',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('deleteAccountSchema', () => {
      it('requires password and confirmation', () => {
        const result = deleteAccountSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('accepts valid payload', () => {
        const result = deleteAccountSchema.safeParse({
          currentPassword: 'password123',
          confirmation: 'DELETE',
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
