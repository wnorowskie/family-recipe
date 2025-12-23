import { type RecipeIngredientUnit } from '@/lib/validation';
import { type ImporterResponse } from '@/lib/recipeImporter';

export interface PrefillIngredient {
  name: string;
  quantity: string;
  unit: RecipeIngredientUnit;
}

export interface PrefillStep {
  text: string;
}

export interface PrefillRecipe {
  title?: string;
  ingredients: PrefillIngredient[];
  steps: PrefillStep[];
  servings: string;
  totalTimeHours: string;
  totalTimeMinutes: string;
  origin: string;
  lowConfidence: boolean;
  warnings: string[];
}

function minutesToParts(totalMinutes?: number | null): {
  hours: string;
  minutes: string;
} {
  if (!totalMinutes || totalMinutes <= 0) {
    return { hours: '0', minutes: '0' };
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours: hours.toString(), minutes: minutes.toString() };
}

export function mapImporterResponseToPrefill(
  response: ImporterResponse
): PrefillRecipe {
  const { recipe, confidence, warnings } = response;
  const timeParts = minutesToParts(recipe.total_time_minutes ?? null);

  const ingredients = (recipe.ingredients || []).map((item) => ({
    name: item,
    quantity: '',
    unit: 'unitless' as RecipeIngredientUnit,
  }));

  const steps = (recipe.steps || []).map((text) => ({ text }));

  const origin = recipe.source?.domain || recipe.source?.url || '';
  const lowConfidence =
    warnings.includes('LOW_CONFIDENCE') || confidence < 0.65;

  return {
    title: recipe.title || undefined,
    ingredients,
    steps,
    servings: recipe.servings ? recipe.servings.toString() : '',
    totalTimeHours: timeParts.hours,
    totalTimeMinutes: timeParts.minutes,
    origin,
    lowConfidence,
    warnings,
  };
}
