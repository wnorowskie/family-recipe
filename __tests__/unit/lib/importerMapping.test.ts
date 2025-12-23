import { mapImporterResponseToPrefill } from '@/components/add/importerMapping';
import { type ImporterResponse } from '@/lib/recipeImporter';

const baseResponse: ImporterResponse = {
  request_id: 'req-123',
  confidence: 0.9,
  warnings: [],
  missing_fields: [],
  recipe: {
    title: 'Best Chili',
    ingredients: ['1 lb beef', '1 onion'],
    steps: ['Brown beef', 'Add onion'],
    servings: '4',
    total_time_minutes: 60,
    image_url: null,
    author: 'Test',
    source: { domain: 'example.com', url: 'https://example.com' },
  },
};

describe('mapImporterResponseToPrefill', () => {
  it('maps basic fields and time parts', () => {
    const result = mapImporterResponseToPrefill(baseResponse);

    expect(result.title).toBe('Best Chili');
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0].name).toBe('1 lb beef');
    expect(result.steps[1].text).toBe('Add onion');
    expect(result.servings).toBe('4');
    expect(result.totalTimeHours).toBe('1');
    expect(result.totalTimeMinutes).toBe('0');
    expect(result.origin).toBe('example.com');
    expect(result.lowConfidence).toBe(false);
  });

  it('flags low confidence and handles missing lists', () => {
    const response: ImporterResponse = {
      ...baseResponse,
      confidence: 0.5,
      warnings: ['LOW_CONFIDENCE'],
      recipe: {
        ...baseResponse.recipe,
        ingredients: [],
        steps: [],
        total_time_minutes: null,
      },
    };

    const result = mapImporterResponseToPrefill(response);
    expect(result.ingredients).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
    expect(result.totalTimeHours).toBe('0');
    expect(result.lowConfidence).toBe(true);
  });
});
