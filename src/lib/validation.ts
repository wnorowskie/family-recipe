import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  emailOrUsername: z.string().min(1, 'Email or username is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  familyMasterKey: z.string().min(1, 'Family Master Key is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const courseEnum = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'dessert',
  'snack',
  'other',
]);

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);

export const ingredientUnitEnum = z.enum([
  'tsp',
  'tbsp',
  'cup',
  'fl_oz',
  'pint',
  'quart',
  'gallon',
  'ml',
  'l',
  'oz',
  'lb',
  'g',
  'kg',
  'whole',
  'piece',
  'slice',
  'clove',
  'can',
  'jar',
  'packet',
  'stick',
  'bunch',
  'head',
  'sprig',
  'dash',
  'pinch',
  'drop',
  'splash',
  'unitless',
]);

const recipeIngredientSchema = z.object({
  name: z.string().min(1, 'Ingredient name is required').max(120),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be positive')
    .nullable()
    .optional(),
  unit: ingredientUnitEnum,
});

const recipeStepSchema = z.object({
  text: z.string().min(1, 'Step description is required').max(2000),
});
export const recipeDetailsSchema = z.object({
  origin: z.string().min(1).max(120).optional(),
  ingredients: z
    .array(recipeIngredientSchema)
    .min(1, 'At least one ingredient is required')
    .max(50),
  steps: z
    .array(recipeStepSchema)
    .min(1, 'At least one step is required')
    .max(50),
  totalTime: z
    .number({ invalid_type_error: 'Total time must be a number' })
    .int('Total time must be an integer')
    .positive('Total time must be positive')
    .optional(),
  servings: z
    .number({ invalid_type_error: 'Servings must be a number' })
    .int('Servings must be an integer')
    .positive('Servings must be positive')
    .optional(),
  courses: z
    .array(courseEnum)
    .min(1, 'Select at least one course')
    .max(courseEnum.options.length)
    .optional(),
  course: courseEnum.optional(),
  difficulty: difficultyEnum.optional(),
  tags: z
    .array(z.string().min(1).max(40))
    .max(10)
    .optional(),
});

export const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(160),
  caption: z.string().max(2000).optional(),
  recipe: recipeDetailsSchema.optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type RecipeDetailsInput = z.infer<typeof recipeDetailsSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
export type RecipeStepInput = z.infer<typeof recipeStepSchema>;
export type RecipeIngredientUnit = z.infer<typeof ingredientUnitEnum>;
export type RecipeCourseValue = z.infer<typeof courseEnum>;

export const createCommentSchema = z.object({
  text: z.string().min(1, 'Comment is required').max(2000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const reactionSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string().min(1, 'Target ID is required'),
  emoji: z.string().min(1, 'Emoji is required').max(4),
});

export type ReactionInput = z.infer<typeof reactionSchema>;

export const cookedEventSchema = z.object({
  rating: z
    .number({ invalid_type_error: 'Rating must be a number' })
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot be more than 5')
    .optional(),
  note: z
    .string()
    .max(1000, 'Note must be 1000 characters or fewer')
    .optional(),
});

export type CookedEventInput = z.infer<typeof cookedEventSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  emailOrUsername: z
    .string()
    .min(1, 'Email or username is required')
    .max(100),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Query parameter validation schemas
 */

// Standard pagination schema (reusable across endpoints)
export const paginationSchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a number' })
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20),
  offset: z.coerce
    .number({ invalid_type_error: 'Offset must be a number' })
    .int('Offset must be an integer')
    .min(0, 'Offset cannot be negative')
    .default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// Timeline query params
export const timelineQuerySchema = paginationSchema;

export type TimelineQueryParams = z.infer<typeof timelineQuerySchema>;

// Recipe filters query params (based on /api/recipes implementation)
const MAX_TIME_MINUTES = 12 * 60; // 12 hours
const MAX_SERVINGS = 50;
const INGREDIENT_LIMIT = 5;

export const recipeFiltersSchema = paginationSchema.extend({
  search: z.string().max(200, 'Search query too long').optional(),
  course: z
    .array(courseEnum)
    .max(courseEnum.options.length, 'Too many courses selected')
    .optional()
    .transform((val) => (val ? Array.from(new Set(val)) : undefined)), // Deduplicate
  tags: z
    .array(z.string().max(40))
    .max(10, 'Too many tags')
    .optional(),
  difficulty: z
    .array(difficultyEnum)
    .max(3, 'Too many difficulty levels')
    .optional()
    .transform((val) => (val ? Array.from(new Set(val)) : undefined)), // Deduplicate
  authorId: z
    .array(z.string().cuid('Invalid author ID'))
    .max(20, 'Too many authors')
    .optional()
    .transform((val) => (val ? Array.from(new Set(val)) : undefined)), // Deduplicate
  totalTimeMin: z.coerce
    .number()
    .int()
    .min(0, 'Minimum time cannot be negative')
    .max(MAX_TIME_MINUTES, `Maximum time is ${MAX_TIME_MINUTES} minutes`)
    .optional(),
  totalTimeMax: z.coerce
    .number()
    .int()
    .min(0, 'Maximum time cannot be negative')
    .max(MAX_TIME_MINUTES, `Maximum time is ${MAX_TIME_MINUTES} minutes`)
    .optional(),
  servingsMin: z.coerce
    .number()
    .int()
    .min(1, 'Minimum servings must be at least 1')
    .max(MAX_SERVINGS, `Maximum servings is ${MAX_SERVINGS}`)
    .optional(),
  servingsMax: z.coerce
    .number()
    .int()
    .min(1, 'Maximum servings must be at least 1')
    .max(MAX_SERVINGS, `Maximum servings is ${MAX_SERVINGS}`)
    .optional(),
  ingredients: z
    .array(z.string().max(120, 'Ingredient name too long'))
    .max(INGREDIENT_LIMIT, `Maximum ${INGREDIENT_LIMIT} ingredients`)
    .optional(),
  sort: z.enum(['recent', 'alpha'], {
    errorMap: () => ({ message: 'Sort must be either "recent" or "alpha"' }),
  }).default('recent'),
}).refine(
  (data) => {
    // Ensure min <= max for totalTime
    if (data.totalTimeMin !== undefined && data.totalTimeMax !== undefined) {
      return data.totalTimeMin <= data.totalTimeMax;
    }
    return true;
  },
  {
    message: 'Minimum total time cannot be greater than maximum',
    path: ['totalTimeMin'],
  }
).refine(
  (data) => {
    // Ensure min <= max for servings
    if (data.servingsMin !== undefined && data.servingsMax !== undefined) {
      return data.servingsMin <= data.servingsMax;
    }
    return true;
  },
  {
    message: 'Minimum servings cannot be greater than maximum',
    path: ['servingsMin'],
  }
);

export type RecipeFiltersParams = z.infer<typeof recipeFiltersSchema>;

// Comments query params (pagination only)
export const commentsQuerySchema = paginationSchema;

export type CommentsQueryParams = z.infer<typeof commentsQuerySchema>;

// Cooked events query params (pagination only)
export const cookedQuerySchema = paginationSchema;

export type CookedQueryParams = z.infer<typeof cookedQuerySchema>;

/**
 * Route parameter validation schemas
 */

// Generic CUID parameter schema
export const cuidParamSchema = z.object({
  id: z.string().cuid('Invalid ID format'),
});

export type CuidParam = z.infer<typeof cuidParamSchema>;

// Specific route param schemas
export const postIdParamSchema = z.object({
  postId: z.string().cuid('Invalid post ID'),
});

export type PostIdParam = z.infer<typeof postIdParamSchema>;

export const commentIdParamSchema = z.object({
  commentId: z.string().cuid('Invalid comment ID'),
});

export type CommentIdParam = z.infer<typeof commentIdParamSchema>;

export const userIdParamSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;
