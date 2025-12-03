import {
  createPostSchema,
  ingredientUnitEnum,
  courseEnum,
  type RecipeIngredientUnit,
  type RecipeCourseValue,
  type CreatePostInput,
} from '@/lib/validation';

export const MAX_PHOTO_COUNT = 10;
const INGREDIENT_UNITS = new Set<RecipeIngredientUnit>(ingredientUnitEnum.options);
const COURSE_VALUES = new Set<RecipeCourseValue>(courseEnum.options);
const MAX_COURSE_SELECTION = 3;

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function sanitizeIngredients(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      const unit =
        typeof raw.unit === 'string' && INGREDIENT_UNITS.has(raw.unit as RecipeIngredientUnit)
          ? (raw.unit as RecipeIngredientUnit)
          : 'unitless';
      const quantity = toOptionalNumber(raw.quantity);

      if (!name) {
        return null;
      }

      return {
        name,
        unit,
        quantity: typeof quantity === 'number' ? quantity : undefined,
      };
    })
    .filter(
      (entry): entry is { name: string; unit: RecipeIngredientUnit; quantity: number | undefined } =>
        Boolean(entry)
    );
}

function sanitizeSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';

      if (!text) {
        return null;
      }

      return { text };
    })
    .filter((entry): entry is { text: string } => Boolean(entry));
}

function sanitizeCourses(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = Array.from(
    new Set(
      value
        .filter((entry): entry is RecipeCourseValue =>
          typeof entry === 'string' && COURSE_VALUES.has(entry as RecipeCourseValue)
        )
        .map((entry) => entry as RecipeCourseValue)
    )
  );

  return deduped.slice(0, MAX_COURSE_SELECTION);
}

export function normalizePostPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const raw = payload as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  if (typeof raw.title === 'string') {
    normalized.title = raw.title.trim();
  }

  if (typeof raw.caption === 'string') {
    const caption = raw.caption.trim();
    if (caption.length > 0) {
      normalized.caption = caption;
    }
  }

  if (raw.recipe && typeof raw.recipe === 'object') {
    const recipe = raw.recipe as Record<string, unknown>;
    const ingredients = sanitizeIngredients(recipe.ingredients);
    const steps = sanitizeSteps(recipe.steps);

    if (ingredients.length > 0 && steps.length > 0) {
      const recipePayload: Record<string, unknown> = {
        ingredients,
        steps,
      };

      if (typeof recipe.origin === 'string') {
        const origin = recipe.origin.trim();
        if (origin) {
          recipePayload.origin = origin;
        }
      }

      const totalTime = toOptionalNumber(recipe.totalTime);
      if (typeof totalTime === 'number') {
        recipePayload.totalTime = totalTime;
      }

      const servings = toOptionalNumber(recipe.servings);
      if (typeof servings === 'number') {
        recipePayload.servings = servings;
      }

      const courseList = sanitizeCourses(recipe.courses);
      if (
        courseList.length === 0 &&
        typeof recipe.course === 'string' &&
        COURSE_VALUES.has(recipe.course as RecipeCourseValue)
      ) {
        courseList.push(recipe.course as RecipeCourseValue);
      }

      if (courseList.length > 0) {
        recipePayload.courses = courseList;
      }

      if (typeof recipe.difficulty === 'string') {
        recipePayload.difficulty = recipe.difficulty;
      }

      if (Array.isArray(recipe.tags)) {
        const tags = Array.from(
          new Set(
            recipe.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          )
        );

        recipePayload.tags = tags;
      }

      normalized.recipe = recipePayload;
    }
  }

  return normalized;
}

export type NormalizedPostPayload = ReturnType<typeof normalizePostPayload>;
export type ValidPostPayload = CreatePostInput;
