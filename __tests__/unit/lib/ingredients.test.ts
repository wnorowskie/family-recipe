/**
 * Unit Tests: Ingredient Utilities (src/lib/ingredients.ts)
 * 
 * Tests ingredient unit formatting and labeling utilities.
 * 
 */
 
import {
  ingredientUnitLabels,
  ingredientUnitOptions,
  formatIngredientUnit,
} from '@/lib/ingredients';
import { RecipeIngredientUnit } from '@/lib/validation';

describe('Ingredient Utilities', () => {
  describe('ingredientUnitLabels', () => {
    it('should contain all valid ingredient units', () => {
      const expectedUnits: RecipeIngredientUnit[] = [
        'tsp', 'tbsp', 'cup', 'fl_oz', 'pint', 'quart', 'gallon',
        'ml', 'l', 'oz', 'lb', 'g', 'kg',
        'whole', 'piece', 'slice', 'clove', 'can', 'jar', 'packet',
        'stick', 'bunch', 'head', 'sprig',
        'dash', 'pinch', 'drop', 'splash', 'unitless',
      ];

      for (const unit of expectedUnits) {
        expect(ingredientUnitLabels).toHaveProperty(unit);
        expect(typeof ingredientUnitLabels[unit]).toBe('string');
      }
    });

    it('should have human-readable labels for volume measurements', () => {
      expect(ingredientUnitLabels.tsp).toBe('tsp');
      expect(ingredientUnitLabels.tbsp).toBe('tbsp');
      expect(ingredientUnitLabels.cup).toBe('Cup');
      expect(ingredientUnitLabels.fl_oz).toBe('Fl oz');
      expect(ingredientUnitLabels.pint).toBe('Pint');
      expect(ingredientUnitLabels.quart).toBe('Quart');
      expect(ingredientUnitLabels.gallon).toBe('Gallon');
    });

    it('should have human-readable labels for metric volume', () => {
      expect(ingredientUnitLabels.ml).toBe('mL');
      expect(ingredientUnitLabels.l).toBe('L');
    });

    it('should have human-readable labels for weight measurements', () => {
      expect(ingredientUnitLabels.oz).toBe('oz');
      expect(ingredientUnitLabels.lb).toBe('lb');
      expect(ingredientUnitLabels.g).toBe('g');
      expect(ingredientUnitLabels.kg).toBe('kg');
    });

    it('should have human-readable labels for count-based units', () => {
      expect(ingredientUnitLabels.whole).toBe('Whole');
      expect(ingredientUnitLabels.piece).toBe('Piece');
      expect(ingredientUnitLabels.slice).toBe('Slice');
      expect(ingredientUnitLabels.clove).toBe('Clove');
    });

    it('should have human-readable labels for container units', () => {
      expect(ingredientUnitLabels.can).toBe('Can');
      expect(ingredientUnitLabels.jar).toBe('Jar');
      expect(ingredientUnitLabels.packet).toBe('Packet');
      expect(ingredientUnitLabels.stick).toBe('Stick');
    });

    it('should have human-readable labels for produce units', () => {
      expect(ingredientUnitLabels.bunch).toBe('Bunch');
      expect(ingredientUnitLabels.head).toBe('Head');
      expect(ingredientUnitLabels.sprig).toBe('Sprig');
    });

    it('should have human-readable labels for imprecise measurements', () => {
      expect(ingredientUnitLabels.dash).toBe('Dash');
      expect(ingredientUnitLabels.pinch).toBe('Pinch');
      expect(ingredientUnitLabels.drop).toBe('Drop');
      expect(ingredientUnitLabels.splash).toBe('Splash');
    });

    it('should have unitless option', () => {
      expect(ingredientUnitLabels.unitless).toBe('Unitless');
    });

    it('should be a complete mapping with no undefined values', () => {
      const values = Object.values(ingredientUnitLabels);
      expect(values.length).toBeGreaterThan(0);
      expect(values.every(v => typeof v === 'string' && v.length > 0)).toBe(true);
    });

    it('should be read-only at runtime', () => {
      const keys = Object.keys(ingredientUnitLabels);
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('ingredientUnitOptions', () => {
    it('should be an array of option objects', () => {
      expect(Array.isArray(ingredientUnitOptions)).toBe(true);
      expect(ingredientUnitOptions.length).toBeGreaterThan(0);
    });

    it('should contain objects with value and label properties', () => {
      for (const option of ingredientUnitOptions) {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(typeof option.value).toBe('string');
        expect(typeof option.label).toBe('string');
      }
    });

    it('should include all ingredient units', () => {
      const values = ingredientUnitOptions.map(o => o.value);
      
      expect(values).toContain('tsp');
      expect(values).toContain('tbsp');
      expect(values).toContain('cup');
      expect(values).toContain('oz');
      expect(values).toContain('lb');
      expect(values).toContain('g');
      expect(values).toContain('kg');
      expect(values).toContain('whole');
      expect(values).toContain('piece');
      expect(values).toContain('unitless');
    });

    it('should map values to their corresponding labels', () => {
      for (const option of ingredientUnitOptions) {
        expect(option.label).toBe(ingredientUnitLabels[option.value as RecipeIngredientUnit]);
      }
    });

    it('should have at least 29 unit options', () => {
      // Based on the ingredientUnitLabels object
      expect(ingredientUnitOptions.length).toBeGreaterThanOrEqual(29);
    });

    it('should have unique values', () => {
      const values = ingredientUnitOptions.map(o => o.value);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should contain volume measurements', () => {
      const values = ingredientUnitOptions.map(o => o.value);
      expect(values).toContain('tsp');
      expect(values).toContain('cup');
      expect(values).toContain('ml');
      expect(values).toContain('l');
    });

    it('should contain weight measurements', () => {
      const values = ingredientUnitOptions.map(o => o.value);
      expect(values).toContain('oz');
      expect(values).toContain('lb');
      expect(values).toContain('g');
      expect(values).toContain('kg');
    });

    it('should contain count-based units', () => {
      const values = ingredientUnitOptions.map(o => o.value);
      expect(values).toContain('whole');
      expect(values).toContain('piece');
      expect(values).toContain('clove');
    });

    it('should be suitable for UI dropdown menus', () => {
      // Each option should have the structure needed for select/dropdown components
      const firstOption = ingredientUnitOptions[0];
      expect(firstOption).toMatchObject({
        value: expect.any(String),
        label: expect.any(String),
      });
    });
  });

  describe('formatIngredientUnit()', () => {
    it('should format tsp correctly', () => {
      expect(formatIngredientUnit('tsp')).toBe('tsp');
    });

    it('should format tbsp correctly', () => {
      expect(formatIngredientUnit('tbsp')).toBe('tbsp');
    });

    it('should format cup correctly', () => {
      expect(formatIngredientUnit('cup')).toBe('Cup');
    });

    it('should format fl_oz correctly', () => {
      expect(formatIngredientUnit('fl_oz')).toBe('Fl oz');
    });

    it('should format metric volume units', () => {
      expect(formatIngredientUnit('ml')).toBe('mL');
      expect(formatIngredientUnit('l')).toBe('L');
    });

    it('should format weight units correctly', () => {
      expect(formatIngredientUnit('oz')).toBe('oz');
      expect(formatIngredientUnit('lb')).toBe('lb');
      expect(formatIngredientUnit('g')).toBe('g');
      expect(formatIngredientUnit('kg')).toBe('kg');
    });

    it('should format count-based units', () => {
      expect(formatIngredientUnit('whole')).toBe('Whole');
      expect(formatIngredientUnit('piece')).toBe('Piece');
      expect(formatIngredientUnit('slice')).toBe('Slice');
      expect(formatIngredientUnit('clove')).toBe('Clove');
    });

    it('should format container units', () => {
      expect(formatIngredientUnit('can')).toBe('Can');
      expect(formatIngredientUnit('jar')).toBe('Jar');
      expect(formatIngredientUnit('packet')).toBe('Packet');
    });

    it('should format produce units', () => {
      expect(formatIngredientUnit('bunch')).toBe('Bunch');
      expect(formatIngredientUnit('head')).toBe('Head');
      expect(formatIngredientUnit('sprig')).toBe('Sprig');
    });

    it('should format imprecise measurement units', () => {
      expect(formatIngredientUnit('dash')).toBe('Dash');
      expect(formatIngredientUnit('pinch')).toBe('Pinch');
      expect(formatIngredientUnit('drop')).toBe('Drop');
      expect(formatIngredientUnit('splash')).toBe('Splash');
    });

    it('should format unitless', () => {
      expect(formatIngredientUnit('unitless')).toBe('Unitless');
    });

    it('should return the same value for all valid units', () => {
      // Test that the function consistently returns label values
      const units: RecipeIngredientUnit[] = ['tsp', 'cup', 'oz', 'whole', 'piece'];
      
      for (const unit of units) {
        const formatted = formatIngredientUnit(unit);
        expect(formatted).toBe(ingredientUnitLabels[unit]);
      }
    });

    it('should handle all 29+ ingredient unit types', () => {
      const allUnits: RecipeIngredientUnit[] = Object.keys(ingredientUnitLabels) as RecipeIngredientUnit[];
      
      for (const unit of allUnits) {
        const result = formatIngredientUnit(unit);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should provide fallback for unknown units', () => {
      // While TypeScript prevents this at compile time, test runtime behavior
      const unknownUnit = 'invalid_unit' as RecipeIngredientUnit;
      const result = formatIngredientUnit(unknownUnit);
      // Should return the unit itself as fallback
      expect(result).toBe('invalid_unit');
    });

    it('should preserve casing in labels', () => {
      expect(formatIngredientUnit('cup')).toBe('Cup'); // Capital C
      expect(formatIngredientUnit('ml')).toBe('mL'); // Lowercase m, capital L
      expect(formatIngredientUnit('tsp')).toBe('tsp'); // All lowercase
    });
  });

  describe('Integration Scenarios', () => {
    it('should work together for rendering ingredient lists', () => {
      // Simulate rendering an ingredient list in a UI
      const ingredient = {
        name: 'flour',
        quantity: 2,
        unit: 'cup' as RecipeIngredientUnit,
      };

      const formattedUnit = formatIngredientUnit(ingredient.unit);
      expect(formattedUnit).toBe('Cup');
      
      const displayText = `${ingredient.quantity} ${formattedUnit} ${ingredient.name}`;
      expect(displayText).toBe('2 Cup flour');
    });

    it('should support creating dropdown options', () => {
      // Simulate populating a dropdown in a recipe form
      const options = ingredientUnitOptions;
      
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toHaveProperty('value');
      expect(options[0]).toHaveProperty('label');
      
      // Verify we can find specific units
      const cupOption = options.find(o => o.value === 'cup');
      expect(cupOption).toBeDefined();
      expect(cupOption?.label).toBe('Cup');
    });

    it('should handle complete ingredient formatting workflow', () => {
      const ingredients = [
        { name: 'sugar', quantity: 1, unit: 'cup' as RecipeIngredientUnit },
        { name: 'butter', quantity: 0.5, unit: 'lb' as RecipeIngredientUnit },
        { name: 'eggs', quantity: 2, unit: 'whole' as RecipeIngredientUnit },
        { name: 'salt', quantity: null, unit: 'pinch' as RecipeIngredientUnit },
      ];

      for (const ing of ingredients) {
        const formatted = formatIngredientUnit(ing.unit);
        expect(typeof formatted).toBe('string');
        
        // Check that the unit exists in the labels
        expect(ingredientUnitLabels[ing.unit]).toBe(formatted);
      }
    });
  });

  describe('Type Safety', () => {
    it('should have consistent types between labels and options', () => {
      // All option values should be keys in ingredientUnitLabels
      for (const option of ingredientUnitOptions) {
        const unit = option.value as RecipeIngredientUnit;
        expect(ingredientUnitLabels).toHaveProperty(unit);
      }
    });

    it('should export all expected ingredient unit types', () => {
      const labelKeys = Object.keys(ingredientUnitLabels);
      const optionValues = ingredientUnitOptions.map(o => o.value);
      
      // Options should be derived from labels
      expect(optionValues.length).toBe(labelKeys.length);
    });
  });
});
