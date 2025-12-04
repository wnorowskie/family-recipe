/**
 * Test Data Factories
 *
 * Factory functions for creating mock data objects used in tests.
 * Each factory provides sensible defaults and allows overrides.
 */

import { User, Post, Comment, Reaction, CookedEvent, Favorite } from '@prisma/client';

/**
 * Create a mock user with default values
 */
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user_test123',
  emailOrUsername: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$10$hashedPasswordExample123456789',
  avatarUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock family space
 */
export const createMockFamilySpace = (overrides = {}) => ({
  id: 'family_test123',
  name: 'Test Family',
  masterKeyHash: '$2b$10$hashedMasterKeyExample123456789',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock family membership
 */
export const createMockFamilyMembership = (overrides = {}) => ({
  id: 'membership_test123',
  userId: 'user_test123',
  familySpaceId: 'family_test123',
  role: 'member' as const,
  joinedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock post (can be basic post or recipe)
 */
export const createMockPost = (overrides: Partial<Post> = {}): Post => ({
  id: 'post_test123',
  title: 'Test Recipe',
  caption: 'A delicious test recipe',
  authorId: 'user_test123',
  familySpaceId: 'family_test123',
  hasRecipeDetails: false,
  mainPhotoUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  lastEditAt: null,
  lastEditedBy: null,
  lastEditNote: null,
  ...overrides,
});

/**
 * Create mock recipe details
 */
export const createMockRecipeDetails = (overrides = {}) => ({
  id: 'recipe_test123',
  postId: 'post_test123',
  origin: null,
  totalTime: 30,
  servings: 4,
  course: 'dinner' as const,
  difficulty: 'medium' as const,
  ...overrides,
});

/**
 * Create a mock comment
 */
export const createMockComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'comment_test123',
  text: 'This looks amazing!',
  authorId: 'user_test123',
  postId: 'post_test123',
  photoUrl: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock reaction
 */
export const createMockReaction = (overrides: Partial<Reaction> = {}): Reaction => ({
  id: 'reaction_test123',
  emoji: '❤️',
  userId: 'user_test123',
  targetType: 'post' as const,
  targetId: 'post_test123',
  postId: 'post_test123',
  commentId: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock cooked event
 */
export const createMockCookedEvent = (
  overrides: Partial<CookedEvent> = {}
): CookedEvent => ({
  id: 'cooked_test123',
  userId: 'user_test123',
  postId: 'post_test123',
  rating: 5,
  note: 'Delicious!',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock favorite
 */
export const createMockFavorite = (overrides: Partial<Favorite> = {}): Favorite => ({
  id: 'favorite_test123',
  userId: 'user_test123',
  postId: 'post_test123',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock tag
 */
export const createMockTag = (overrides = {}) => ({
  id: 'tag_test123',
  name: 'vegetarian',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a mock post photo
 */
export const createMockPostPhoto = (overrides = {}) => ({
  id: 'photo_test123',
  postId: 'post_test123',
  url: '/uploads/test-photo.jpg',
  caption: null,
  sortOrder: 0,
  uploadedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Create a complete post with recipe details for testing
 */
export const createMockFullRecipe = () => {
  const post = createMockPost({ title: 'Full Test Recipe' });
  const recipe = createMockRecipeDetails({ postId: post.id });
  const photos = [createMockPostPhoto({ postId: post.id })];
  const tags = [createMockTag({ name: 'dinner' }), createMockTag({ name: 'easy' })];

  return { post, recipe, photos, tags };
};
