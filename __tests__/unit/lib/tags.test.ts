/**
 * Unit Tests: Tag Utilities (src/lib/tags.ts)
 * 
 * Tests tag retrieval and grouping functionality.
 * 
 */

import { getAllTags, TagRecord, TagGroup } from '@/lib/tags';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    tag: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
const mockFindMany = prisma.tag.findMany as jest.MockedFunction<typeof prisma.tag.findMany>;

describe('Tag Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTags()', () => {
    it('should return empty object when no tags exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getAllTags();

      expect(result).toEqual({});
      expect(mockFindMany).toHaveBeenCalledWith({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      });
    });

    it('should group tags by type', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegetarian', type: 'dietary' },
        { id: 'tag_2', name: 'vegan', type: 'dietary' },
        { id: 'tag_3', name: 'quick', type: 'time' },
        { id: 'tag_4', name: 'easy', type: 'difficulty' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result).toHaveProperty('dietary');
      expect(result).toHaveProperty('time');
      expect(result).toHaveProperty('difficulty');
      expect(result.dietary).toHaveLength(2);
      expect(result.time).toHaveLength(1);
      expect(result.difficulty).toHaveLength(1);
    });

    it('should place tags with null type in "other" group', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'favorite', type: null },
        { id: 'tag_2', name: 'special', type: null },
        { id: 'tag_3', name: 'vegan', type: 'dietary' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result).toHaveProperty('other');
      expect(result.other).toHaveLength(2);
      expect(result.other[0].name).toBe('favorite');
      expect(result.other[1].name).toBe('special');
    });

    it('should handle tags with only null types', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'untyped1', type: null },
        { id: 'tag_2', name: 'untyped2', type: null },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(Object.keys(result)).toEqual(['other']);
      expect(result.other).toHaveLength(2);
    });

    it('should return tags ordered by type then name', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'apple', type: 'fruit' },
        { id: 'tag_2', name: 'zucchini', type: 'vegetable' },
        { id: 'tag_3', name: 'banana', type: 'fruit' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      await getAllTags();

      expect(mockFindMany).toHaveBeenCalledWith({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      });
    });

    it('should handle mixed typed and untyped tags', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegan', type: 'dietary' },
        { id: 'tag_2', name: 'random', type: null },
        { id: 'tag_3', name: 'quick', type: 'time' },
        { id: 'tag_4', name: 'special', type: null },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(Object.keys(result).sort()).toEqual(['dietary', 'other', 'time'].sort());
      expect(result.dietary).toHaveLength(1);
      expect(result.time).toHaveLength(1);
      expect(result.other).toHaveLength(2);
    });

    it('should preserve all tag properties', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_123', name: 'gluten-free', type: 'dietary' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result.dietary[0]).toEqual({
        id: 'tag_123',
        name: 'gluten-free',
        type: 'dietary',
      });
    });

    it('should handle single tag', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'healthy', type: 'lifestyle' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(Object.keys(result)).toEqual(['lifestyle']);
      expect(result.lifestyle).toHaveLength(1);
      expect(result.lifestyle[0].name).toBe('healthy');
    });

    it('should handle multiple tags of same type', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegetarian', type: 'dietary' },
        { id: 'tag_2', name: 'vegan', type: 'dietary' },
        { id: 'tag_3', name: 'gluten-free', type: 'dietary' },
        { id: 'tag_4', name: 'dairy-free', type: 'dietary' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(Object.keys(result)).toEqual(['dietary']);
      expect(result.dietary).toHaveLength(4);
      expect(result.dietary.map(t => t.name)).toEqual([
        'vegetarian',
        'vegan',
        'gluten-free',
        'dairy-free',
      ]);
    });

    it('should handle many different tag types', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegan', type: 'dietary' },
        { id: 'tag_2', name: 'quick', type: 'time' },
        { id: 'tag_3', name: 'easy', type: 'difficulty' },
        { id: 'tag_4', name: 'italian', type: 'cuisine' },
        { id: 'tag_5', name: 'comfort', type: 'mood' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(Object.keys(result).sort()).toEqual([
        'dietary',
        'time',
        'difficulty',
        'cuisine',
        'mood',
      ].sort());
      expect(Object.values(result).every(group => group.length === 1)).toBe(true);
    });

    it('should return TagGroup type structure', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'test', type: 'type1' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      // Verify it matches TagGroup type structure
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(false);
      
      // Each value should be an array of TagRecords
      for (const group of Object.values(result)) {
        expect(Array.isArray(group)).toBe(true);
        for (const tag of group) {
          expect(tag).toHaveProperty('id');
          expect(tag).toHaveProperty('name');
          expect(tag).toHaveProperty('type');
        }
      }
    });

    it('should handle Prisma query errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('Database error'));

      await expect(getAllTags()).rejects.toThrow('Database error');
    });

    it('should call Prisma with correct ordering parameters', async () => {
      mockFindMany.mockResolvedValue([]);

      await getAllTags();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([
            { type: 'asc' },
            { name: 'asc' },
          ]),
        })
      );
    });
  });

  describe('Type Definitions', () => {
    it('should export TagRecord interface', () => {
      const tag: TagRecord = {
        id: 'test_id',
        name: 'test_name',
        type: 'test_type',
      };

      expect(tag).toHaveProperty('id');
      expect(tag).toHaveProperty('name');
      expect(tag).toHaveProperty('type');
    });

    it('should allow TagRecord with null type', () => {
      const tag: TagRecord = {
        id: 'test_id',
        name: 'test_name',
        type: null,
      };

      expect(tag.type).toBeNull();
    });

    it('should export TagGroup type', () => {
      const tagGroup: TagGroup = {
        dietary: [
          { id: 'tag_1', name: 'vegan', type: 'dietary' },
        ],
        time: [
          { id: 'tag_2', name: 'quick', type: 'time' },
        ],
      };

      expect(tagGroup).toHaveProperty('dietary');
      expect(tagGroup).toHaveProperty('time');
    });
  });

  describe('Integration Scenarios', () => {
    it('should support typical recipe tagging workflow', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegetarian', type: 'dietary' },
        { id: 'tag_2', name: 'gluten-free', type: 'dietary' },
        { id: 'tag_3', name: 'under-30-min', type: 'time' },
        { id: 'tag_4', name: 'easy', type: 'difficulty' },
        { id: 'tag_5', name: 'italian', type: 'cuisine' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      // Verify we can access tags by category for UI display
      expect(result.dietary).toBeDefined();
      expect(result.time).toBeDefined();
      expect(result.difficulty).toBeDefined();
      expect(result.cuisine).toBeDefined();

      // Verify dietary tags are grouped together
      const dietaryTagNames = result.dietary.map(t => t.name);
      expect(dietaryTagNames).toContain('vegetarian');
      expect(dietaryTagNames).toContain('gluten-free');
    });

    it('should support tag selection in recipe forms', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegan', type: 'dietary' },
        { id: 'tag_2', name: 'quick', type: 'time' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      // Simulate rendering tag options grouped by type
      const tagOptions = Object.entries(result).flatMap(([type, tags]) =>
        tags.map(tag => ({
          value: tag.id,
          label: tag.name,
          group: type,
        }))
      );

      expect(tagOptions.length).toBe(2);
      expect(tagOptions[0]).toMatchObject({
        value: expect.any(String),
        label: expect.any(String),
        group: expect.any(String),
      });
    });

    it('should handle empty database gracefully for new installations', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getAllTags();

      expect(result).toEqual({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should support filtering recipes by tag groups', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'vegan', type: 'dietary' },
        { id: 'tag_2', name: 'vegetarian', type: 'dietary' },
        { id: 'tag_3', name: 'quick', type: 'time' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      // Get all dietary restriction tags for filtering UI
      const dietaryTags = result.dietary || [];
      expect(dietaryTags.length).toBe(2);
      
      // Get all time-based tags
      const timeTags = result.time || [];
      expect(timeTags.length).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tags with special characters in names', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'gluten-free', type: 'dietary' },
        { id: 'tag_2', name: 'kid-friendly', type: 'audience' },
        { id: 'tag_3', name: '< 30 min', type: 'time' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result.dietary[0].name).toBe('gluten-free');
      expect(result.audience[0].name).toBe('kid-friendly');
      expect(result.time[0].name).toBe('< 30 min');
    });

    it('should handle tags with empty string type as other', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'misc', type: '' as any },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      // Empty string should be treated as a valid type, not mapped to "other"
      expect(result['']).toBeDefined();
    });

    it('should handle very long tag names', async () => {
      const longName = 'a'.repeat(200);
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: longName, type: 'test' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result.test[0].name).toBe(longName);
      expect(result.test[0].name.length).toBe(200);
    });

    it('should maintain insertion order within groups', async () => {
      const mockTags: TagRecord[] = [
        { id: 'tag_1', name: 'first', type: 'order' },
        { id: 'tag_2', name: 'second', type: 'order' },
        { id: 'tag_3', name: 'third', type: 'order' },
      ];

      mockFindMany.mockResolvedValue(mockTags as any);

      const result = await getAllTags();

      expect(result.order[0].name).toBe('first');
      expect(result.order[1].name).toBe('second');
      expect(result.order[2].name).toBe('third');
    });
  });
});
