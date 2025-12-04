import { AuthenticatedUser } from './apiAuth';

/**
 * Permission helper utilities for consistent authorization checks.
 * Centralizes permission logic to make changes easier.
 */

/**
 * Check if user is an owner or admin
 */
export function isOwnerOrAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'owner' || user.role === 'admin';
}

/**
 * Check if user can edit a post.
 * Rules: Only the post author or owner/admin can edit.
 */
export function canEditPost(
  user: AuthenticatedUser,
  post: { authorId: string }
): boolean {
  return post.authorId === user.id || isOwnerOrAdmin(user);
}

/**
 * Check if user can delete a post.
 * Rules: Only the post author or owner/admin can delete.
 */
export function canDeletePost(
  user: AuthenticatedUser,
  post: { authorId: string }
): boolean {
  return post.authorId === user.id || isOwnerOrAdmin(user);
}

/**
 * Check if user can delete a comment.
 * Rules: Only the comment author or owner/admin can delete.
 */
export function canDeleteComment(
  user: AuthenticatedUser,
  comment: { authorId: string }
): boolean {
  return comment.authorId === user.id || isOwnerOrAdmin(user);
}

/**
 * Check if user can remove a family member.
 * Rules:
 * - Only owner/admin can remove members
 * - Cannot remove yourself
 * - Cannot remove the owner
 */
export function canRemoveMember(
  actingUser: AuthenticatedUser,
  targetUser: { id: string; role: string }
): {
  allowed: boolean;
  reason?: 'NOT_ADMIN' | 'CANNOT_REMOVE_SELF' | 'CANNOT_REMOVE_OWNER';
} {
  // Must be owner or admin to remove anyone
  if (!isOwnerOrAdmin(actingUser)) {
    return { allowed: false, reason: 'NOT_ADMIN' };
  }

  // Cannot remove yourself
  if (targetUser.id === actingUser.id) {
    return { allowed: false, reason: 'CANNOT_REMOVE_SELF' };
  }

  // Cannot remove the owner
  if (targetUser.role === 'owner') {
    return { allowed: false, reason: 'CANNOT_REMOVE_OWNER' };
  }

  return { allowed: true };
}
