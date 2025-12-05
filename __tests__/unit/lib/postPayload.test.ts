/**
 * Unit Tests: Post Payload Builder (src/lib/postPayload.ts)
 * 
 * Tests post payload normalization and sanitization.
 */

import {
  normalizePostPayload,
  MAX_PHOTO_COUNT,
  NormalizedPostPayload,
} from '@/lib/postPayload';

describe('Post Payload Builder', () => {
  describe('normalizePostPayload()', () => {
    describe('Basic Post (No Recipe)', () => {
      it('should build payload for basic post with title only', () => {
        const input = {
          title: 'Simple Post',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Simple Post',
        });
      });

      it('should build payload for basic post with title and caption', () => {
        const input = {
          title: 'Post with Caption',
          caption: 'This is a caption',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Post with Caption',
          caption: 'This is a caption',
        });
      });

      it('should trim whitespace from title', () => {
        const input = {
          title: '  Trimmed Title  ',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Trimmed Title',
        });
      });

      it('should trim whitespace from caption', () => {
        const input = {
          title: 'Post',
          caption: '  Trimmed Caption  ',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Post',
          caption: 'Trimmed Caption',
        });
      });

      it('should omit empty caption', () => {
        const input = {
          title: 'Post',
          caption: '   ',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Post',
        });
        expect(result).not.toHaveProperty('caption');
      });

      it('should handle missing title', () => {
        const input = {
          caption: 'Caption only',
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('title');
        expect(result).toHaveProperty('caption');
      });
    });

    describe('Full Recipe Post', () => {
      it('should build payload for full recipe post', () => {
        const input = {
          title: 'Chocolate Chip Cookies',
          caption: 'Delicious cookies',
          recipe: {
            origin: 'Grandma\'s recipe',
            ingredients: [
              { name: 'flour', unit: 'cup', quantity: 2 },
              { name: 'sugar', unit: 'cup', quantity: 1 },
            ],
            steps: [
              { text: 'Mix ingredients' },
              { text: 'Bake for 12 minutes' },
            ],
            totalTime: 30,
            servings: 24,
            courses: ['dessert'],
            difficulty: 'easy',
            tags: ['sweet', 'baked'],
          },
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({
          title: 'Chocolate Chip Cookies',
          caption: 'Delicious cookies',
          recipe: {
            origin: 'Grandma\'s recipe',
            ingredients: [
              { name: 'flour', unit: 'cup', quantity: 2 },
              { name: 'sugar', unit: 'cup', quantity: 1 },
            ],
            steps: [
              { text: 'Mix ingredients' },
              { text: 'Bake for 12 minutes' },
            ],
            totalTime: 30,
            servings: 24,
            courses: ['dessert'],
            difficulty: 'easy',
            tags: ['sweet', 'baked'],
          },
        });
      });

      it('should include recipe details when provided', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            origin: 'Test origin',
            ingredients: [{ name: 'test', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Test step' }],
            totalTime: 60,
            servings: 4,
            difficulty: 'medium',
          },
        };

        const result = normalizePostPayload(input);

        expect(result.recipe).toBeDefined();
        expect((result.recipe as any).origin).toBe('Test origin');
        expect((result.recipe as any).totalTime).toBe(60);
        expect((result.recipe as any).servings).toBe(4);
        expect((result.recipe as any).difficulty).toBe('medium');
      });

      it('should omit recipe if ingredients are missing', () => {
        const input = {
          title: 'Incomplete Recipe',
          recipe: {
            steps: [{ text: 'Step 1' }],
          },
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('recipe');
      });

      it('should omit recipe if steps are missing', () => {
        const input = {
          title: 'Incomplete Recipe',
          recipe: {
            ingredients: [{ name: 'flour', unit: 'cup', quantity: 2 }],
          },
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('recipe');
      });

      it('should omit recipe if both ingredients and steps are empty', () => {
        const input = {
          title: 'No Recipe',
          recipe: {
            ingredients: [],
            steps: [],
          },
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('recipe');
      });
    });

    describe('Ingredient Parsing', () => {
      it('should parse and include ingredients', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'flour', unit: 'cup', quantity: 2 },
              { name: 'sugar', unit: 'tsp', quantity: 1 },
            ],
            steps: [{ text: 'Mix' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients).toEqual([
          { name: 'flour', unit: 'cup', quantity: 2 },
          { name: 'sugar', unit: 'tsp', quantity: 1 },
        ]);
      });

      it('should handle ingredients without quantity', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'salt', unit: 'pinch' },
            ],
            steps: [{ text: 'Add salt' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients).toEqual([
          { name: 'salt', unit: 'pinch', quantity: undefined },
        ]);
      });

      it('should trim ingredient names', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: '  flour  ', unit: 'cup', quantity: 2 },
            ],
            steps: [{ text: 'Mix' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients[0].name).toBe('flour');
      });

      it('should filter out ingredients with empty names', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: '', unit: 'cup', quantity: 2 },
              { name: 'flour', unit: 'cup', quantity: 1 },
            ],
            steps: [{ text: 'Mix' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients).toHaveLength(1);
        expect((result.recipe as any).ingredients[0].name).toBe('flour');
      });

      it('should default to unitless for invalid units', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'item', unit: 'invalid_unit', quantity: 1 },
            ],
            steps: [{ text: 'Use' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients[0].unit).toBe('unitless');
      });

      it('should handle string quantity by parsing to number', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'flour', unit: 'cup', quantity: '2' },
            ],
            steps: [{ text: 'Mix' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients[0].quantity).toBe(2);
      });

      it('should handle decimal quantities', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'butter', unit: 'cup', quantity: 0.5 },
            ],
            steps: [{ text: 'Melt' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients[0].quantity).toBe(0.5);
      });

      it('should handle invalid quantity as undefined', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'item', unit: 'cup', quantity: 'not-a-number' },
            ],
            steps: [{ text: 'Use' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients[0].quantity).toBeUndefined();
      });

      it('should filter out non-object ingredient entries', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [
              { name: 'flour', unit: 'cup', quantity: 2 },
              'invalid entry',
              null,
              { name: 'sugar', unit: 'cup', quantity: 1 },
            ],
            steps: [{ text: 'Mix' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).ingredients).toHaveLength(2);
      });
    });

    describe('Step Parsing', () => {
      it('should parse and include steps', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'flour', unit: 'cup', quantity: 1 }],
            steps: [
              { text: 'Step 1' },
              { text: 'Step 2' },
              { text: 'Step 3' },
            ],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).steps).toEqual([
          { text: 'Step 1' },
          { text: 'Step 2' },
          { text: 'Step 3' },
        ]);
      });

      it('should trim step text', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'flour', unit: 'cup', quantity: 1 }],
            steps: [
              { text: '  Trimmed step  ' },
            ],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).steps[0].text).toBe('Trimmed step');
      });

      it('should filter out steps with empty text', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'flour', unit: 'cup', quantity: 1 }],
            steps: [
              { text: '' },
              { text: 'Valid step' },
              { text: '   ' },
            ],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).steps).toHaveLength(1);
        expect((result.recipe as any).steps[0].text).toBe('Valid step');
      });

      it('should filter out non-object step entries', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'flour', unit: 'cup', quantity: 1 }],
            steps: [
              { text: 'Step 1' },
              'invalid',
              null,
              { text: 'Step 2' },
            ],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).steps).toHaveLength(2);
      });
    });

    describe('Course Handling', () => {
      it('should handle courses array', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            courses: ['breakfast', 'lunch'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).courses).toEqual(['breakfast', 'lunch']);
      });

      it('should fallback to course field if courses array is empty', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            course: 'dinner',
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).courses).toEqual(['dinner']);
      });

      it('should deduplicate course values', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            courses: ['breakfast', 'breakfast', 'lunch'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).courses).toEqual(['breakfast', 'lunch']);
      });

      it('should limit courses to maximum of 3', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            courses: ['breakfast', 'lunch', 'dinner', 'dessert'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).courses).toHaveLength(3);
      });

      it('should filter out invalid course values', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            courses: ['breakfast', 'invalid_course', 'lunch'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).courses).toEqual(['breakfast', 'lunch']);
      });
    });

    describe('Tag Handling', () => {
      it('should handle tags correctly', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            tags: ['vegetarian', 'quick', 'easy'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).tags).toEqual(['vegetarian', 'quick', 'easy']);
      });

      it('should trim tag values', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            tags: ['  vegetarian  ', ' quick '],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).tags).toEqual(['vegetarian', 'quick']);
      });

      it('should deduplicate tags', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            tags: ['vegan', 'vegan', 'healthy'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).tags).toEqual(['vegan', 'healthy']);
      });

      it('should filter out empty tags', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            tags: ['vegan', '', '   ', 'healthy'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).tags).toEqual(['vegan', 'healthy']);
      });

      it('should filter out non-string tags', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
            tags: ['vegan', 123, null, 'healthy'],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).tags).toEqual(['vegan', 'healthy']);
      });
    });

    describe('Optional Recipe Fields', () => {
      it('should include origin when provided', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            origin: 'Family recipe',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).origin).toBe('Family recipe');
      });

      it('should trim origin whitespace', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            origin: '  Trimmed origin  ',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).origin).toBe('Trimmed origin');
      });

      it('should omit empty origin', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            origin: '   ',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect(result.recipe).not.toHaveProperty('origin');
      });

      it('should include totalTime when provided', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            totalTime: 45,
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).totalTime).toBe(45);
      });

      it('should parse totalTime from string', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            totalTime: '60',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).totalTime).toBe(60);
      });

      it('should include servings when provided', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            servings: 4,
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).servings).toBe(4);
      });

      it('should parse servings from string', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            servings: '6',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).servings).toBe(6);
      });

      it('should include difficulty when provided', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            difficulty: 'hard',
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).difficulty).toBe('hard');
      });

      it('should include all optional fields together', () => {
        const input = {
          title: 'Complete Recipe',
          recipe: {
            origin: 'Italy',
            totalTime: 120,
            servings: 8,
            difficulty: 'medium',
            courses: ['dinner'],
            tags: ['italian', 'pasta'],
            ingredients: [{ name: 'pasta', unit: 'lb', quantity: 1 }],
            steps: [{ text: 'Boil water' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).origin).toBe('Italy');
        expect((result.recipe as any).totalTime).toBe(120);
        expect((result.recipe as any).servings).toBe(8);
        expect((result.recipe as any).difficulty).toBe('medium');
        expect((result.recipe as any).courses).toEqual(['dinner']);
        expect((result.recipe as any).tags).toEqual(['italian', 'pasta']);
      });
    });

    describe('Edge Cases', () => {
      it('should return empty object for null input', () => {
        const result = normalizePostPayload(null);

        expect(result).toEqual({});
      });

      it('should return empty object for undefined input', () => {
        const result = normalizePostPayload(undefined);

        expect(result).toEqual({});
      });

      it('should return empty object for non-object input', () => {
        const result = normalizePostPayload('not an object');

        expect(result).toEqual({});
      });

      it('should handle empty object input', () => {
        const result = normalizePostPayload({});

        expect(result).toEqual({});
      });

      it('should handle recipe as non-object', () => {
        const input = {
          title: 'Post',
          recipe: 'not an object',
        };

        const result = normalizePostPayload(input);

        expect(result).toEqual({ title: 'Post' });
        expect(result).not.toHaveProperty('recipe');
      });

      it('should handle ingredients as non-array', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: 'not an array',
            steps: [{ text: 'Step' }],
          },
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('recipe');
      });

      it('should handle steps as non-array', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: 'not an array',
          },
        };

        const result = normalizePostPayload(input);

        expect(result).not.toHaveProperty('recipe');
      });

      it('should handle NaN in numeric fields', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            totalTime: NaN,
            servings: NaN,
            ingredients: [{ name: 'item', unit: 'cup', quantity: NaN }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).totalTime).toBeUndefined();
        expect((result.recipe as any).servings).toBeUndefined();
        expect((result.recipe as any).ingredients[0].quantity).toBeUndefined();
      });

      it('should handle Infinity in numeric fields', () => {
        const input = {
          title: 'Recipe',
          recipe: {
            totalTime: Infinity,
            servings: Infinity,
            ingredients: [{ name: 'item', unit: 'cup', quantity: 1 }],
            steps: [{ text: 'Cook' }],
          },
        };

        const result = normalizePostPayload(input);

        expect((result.recipe as any).totalTime).toBeUndefined();
        expect((result.recipe as any).servings).toBeUndefined();
      });
    });

    describe('Constants', () => {
      it('should export MAX_PHOTO_COUNT constant', () => {
        expect(MAX_PHOTO_COUNT).toBe(10);
        expect(typeof MAX_PHOTO_COUNT).toBe('number');
      });
    });

    describe('Type Safety', () => {
      it('should return NormalizedPostPayload type', () => {
        const input = {
          title: 'Test',
        };

        const result: NormalizedPostPayload = normalizePostPayload(input);

        expect(result).toBeDefined();
      });
    });
  });
});
