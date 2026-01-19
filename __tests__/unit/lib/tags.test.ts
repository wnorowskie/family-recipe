/**
 * Unit Tests: Tag Utilities (src/lib/tags.ts)
 *
 * Tags are now hardcoded to match docs/TAGS.md.
 */

import { getAllTags, TagGroup, TagRecord } from '@/lib/tags';

describe('Tag Utilities', () => {
  describe('getAllTags()', () => {
    it('returns the hardcoded tag groups', async () => {
      const result = await getAllTags();

      expect(Object.keys(result).sort()).toEqual(
        ['diet-preference', 'allergen-safe'].sort()
      );
      expect(result['diet-preference'].map((tag) => tag.name)).toEqual([
        'vegetarian',
        'vegan',
        'pescatarian',
      ]);
      expect(result['allergen-safe'].map((tag) => tag.name)).toEqual([
        'nut-free',
        'dairy-free',
        'gluten-free',
      ]);
    });

    it('provides stable ids and type values', async () => {
      const result = await getAllTags();
      const sample = result['diet-preference'][0];

      expect(sample).toHaveProperty('id');
      expect(sample).toHaveProperty('name');
      expect(sample).toHaveProperty('type', 'diet-preference');
      expect(sample.id).toBe(`diet-preference:${sample.name}`);
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
        dietary: [{ id: 'tag_1', name: 'vegan', type: 'dietary' }],
        time: [{ id: 'tag_2', name: 'quick', type: 'time' }],
      };

      expect(tagGroup).toHaveProperty('dietary');
      expect(tagGroup).toHaveProperty('time');
    });
  });
});
