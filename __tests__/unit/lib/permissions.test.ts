/**
 * Unit Tests - Permission Helpers
 *
 * Tests for authorization logic in src/lib/permissions.ts
 * These functions control access to critical operations like editing/deleting posts,
 * comments, and managing family members.
 *
 * Coverage Goal: 100% (authorization logic)
 */

import {
  isOwnerOrAdmin,
  canEditPost,
  canDeletePost,
  canDeleteComment,
  canRemoveMember,
} from '@/lib/permissions';
import { AuthenticatedUser } from '@/lib/apiAuth';

describe('Permission Helpers', () => {
  // Test user fixtures
  const ownerUser: AuthenticatedUser = {
    id: 'user_owner',
    role: 'owner',
    familySpaceId: 'family_123',
  };

  const adminUser: AuthenticatedUser = {
    id: 'user_admin',
    role: 'admin',
    familySpaceId: 'family_123',
  };

  const memberUser: AuthenticatedUser = {
    id: 'user_member',
    role: 'member',
    familySpaceId: 'family_123',
  };

  const anotherMemberUser: AuthenticatedUser = {
    id: 'user_member2',
    role: 'member',
    familySpaceId: 'family_123',
  };

  describe('isOwnerOrAdmin()', () => {
    it('should return true for owner role', () => {
      const result = isOwnerOrAdmin(ownerUser);
      expect(result).toBe(true);
    });

    it('should return true for admin role', () => {
      const result = isOwnerOrAdmin(adminUser);
      expect(result).toBe(true);
    });

    it('should return false for member role', () => {
      const result = isOwnerOrAdmin(memberUser);
      expect(result).toBe(false);
    });

    it('should handle edge case with undefined role', () => {
      const userWithUndefinedRole = {
        ...memberUser,
        role: undefined as any,
      };
      const result = isOwnerOrAdmin(userWithUndefinedRole);
      expect(result).toBe(false);
    });

    it('should handle edge case with null role', () => {
      const userWithNullRole = {
        ...memberUser,
        role: null as any,
      };
      const result = isOwnerOrAdmin(userWithNullRole);
      expect(result).toBe(false);
    });

    it('should handle edge case with invalid role string', () => {
      const userWithInvalidRole = {
        ...memberUser,
        role: 'invalid_role' as any,
      };
      const result = isOwnerOrAdmin(userWithInvalidRole);
      expect(result).toBe(false);
    });
  });

  describe('canEditPost()', () => {
    const postByMember = { authorId: 'user_member' };
    const postByAnotherMember = { authorId: 'user_member2' };

    it('should return true for post author', () => {
      const result = canEditPost(memberUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return true for owner (not author)', () => {
      const result = canEditPost(ownerUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return true for admin (not author)', () => {
      const result = canEditPost(adminUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return false for different member', () => {
      const result = canEditPost(memberUser, postByAnotherMember);
      expect(result).toBe(false);
    });

    it('should return true when author is also owner', () => {
      const postByOwner = { authorId: 'user_owner' };
      const result = canEditPost(ownerUser, postByOwner);
      expect(result).toBe(true);
    });

    it('should return true when author is also admin', () => {
      const postByAdmin = { authorId: 'user_admin' };
      const result = canEditPost(adminUser, postByAdmin);
      expect(result).toBe(true);
    });

    it('should handle post with empty authorId', () => {
      const postWithEmptyAuthor = { authorId: '' };
      const result = canEditPost(memberUser, postWithEmptyAuthor);
      expect(result).toBe(false);
    });

    it('should handle post with null authorId', () => {
      const postWithNullAuthor = { authorId: null as any };
      const result = canEditPost(memberUser, postWithNullAuthor);
      expect(result).toBe(false);
    });
  });

  describe('canDeletePost()', () => {
    const postByMember = { authorId: 'user_member' };
    const postByAnotherMember = { authorId: 'user_member2' };

    it('should return true for post author', () => {
      const result = canDeletePost(memberUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return true for owner (not author)', () => {
      const result = canDeletePost(ownerUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return true for admin (not author)', () => {
      const result = canDeletePost(adminUser, postByMember);
      expect(result).toBe(true);
    });

    it('should return false for different member', () => {
      const result = canDeletePost(memberUser, postByAnotherMember);
      expect(result).toBe(false);
    });

    it('should return true when author is also owner', () => {
      const postByOwner = { authorId: 'user_owner' };
      const result = canDeletePost(ownerUser, postByOwner);
      expect(result).toBe(true);
    });

    it('should return true when author is also admin', () => {
      const postByAdmin = { authorId: 'user_admin' };
      const result = canDeletePost(adminUser, postByAdmin);
      expect(result).toBe(true);
    });

    it('should handle post with empty authorId', () => {
      const postWithEmptyAuthor = { authorId: '' };
      const result = canDeletePost(memberUser, postWithEmptyAuthor);
      expect(result).toBe(false);
    });

    it('should handle post with null authorId', () => {
      const postWithNullAuthor = { authorId: null as any };
      const result = canDeletePost(memberUser, postWithNullAuthor);
      expect(result).toBe(false);
    });
  });

  describe('canDeleteComment()', () => {
    const commentByMember = { authorId: 'user_member' };
    const commentByAnotherMember = { authorId: 'user_member2' };

    it('should return true for comment author', () => {
      const result = canDeleteComment(memberUser, commentByMember);
      expect(result).toBe(true);
    });

    it('should return true for owner (not author)', () => {
      const result = canDeleteComment(ownerUser, commentByMember);
      expect(result).toBe(true);
    });

    it('should return true for admin (not author)', () => {
      const result = canDeleteComment(adminUser, commentByMember);
      expect(result).toBe(true);
    });

    it('should return false for different member', () => {
      const result = canDeleteComment(memberUser, commentByAnotherMember);
      expect(result).toBe(false);
    });

    it('should return true when author is also owner', () => {
      const commentByOwner = { authorId: 'user_owner' };
      const result = canDeleteComment(ownerUser, commentByOwner);
      expect(result).toBe(true);
    });

    it('should return true when author is also admin', () => {
      const commentByAdmin = { authorId: 'user_admin' };
      const result = canDeleteComment(adminUser, commentByAdmin);
      expect(result).toBe(true);
    });

    it('should handle comment with empty authorId', () => {
      const commentWithEmptyAuthor = { authorId: '' };
      const result = canDeleteComment(memberUser, commentWithEmptyAuthor);
      expect(result).toBe(false);
    });

    it('should handle comment with null authorId', () => {
      const commentWithNullAuthor = { authorId: null as any };
      const result = canDeleteComment(memberUser, commentWithNullAuthor);
      expect(result).toBe(false);
    });
  });

  describe('canRemoveMember()', () => {
    const targetMember = { id: 'user_member', role: 'member' };
    const targetAdmin = { id: 'user_admin', role: 'admin' };
    const targetOwner = { id: 'user_owner', role: 'owner' };

    describe('Success Cases', () => {
      it('should return true for owner removing member', () => {
        const result = canRemoveMember(ownerUser, targetMember);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should return true for owner removing admin', () => {
        const result = canRemoveMember(ownerUser, targetAdmin);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should return true for admin removing member', () => {
        const result = canRemoveMember(adminUser, targetMember);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should return true for admin removing another admin', () => {
        const anotherAdmin = { id: 'user_admin2', role: 'admin' };
        const result = canRemoveMember(adminUser, anotherAdmin);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe('Failure Cases - NOT_ADMIN', () => {
      it('should return false for non-owner/admin', () => {
        const result = canRemoveMember(memberUser, anotherMemberUser);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('NOT_ADMIN');
      });

      it('should return false for member trying to remove admin', () => {
        const result = canRemoveMember(memberUser, targetAdmin);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('NOT_ADMIN');
      });

      it('should return false for member trying to remove owner', () => {
        const result = canRemoveMember(memberUser, targetOwner);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('NOT_ADMIN');
      });
    });

    describe('Failure Cases - CANNOT_REMOVE_SELF', () => {
      it('should return false when trying to remove self (owner)', () => {
        const result = canRemoveMember(ownerUser, targetOwner);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_SELF');
      });

      it('should return false when trying to remove self (admin)', () => {
        const result = canRemoveMember(adminUser, targetAdmin);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_SELF');
      });

      it('should return false when trying to remove self (member)', () => {
        // Even though member is not admin, the self-check happens after admin check
        const selfMember = { id: 'user_member', role: 'member' };
        const result = canRemoveMember(memberUser, selfMember);
        expect(result.allowed).toBe(false);
        // This will be NOT_ADMIN because that check happens first
        expect(result.reason).toBe('NOT_ADMIN');
      });
    });

    describe('Failure Cases - CANNOT_REMOVE_OWNER', () => {
      it('should return false when trying to remove owner (admin attempting)', () => {
        const result = canRemoveMember(adminUser, targetOwner);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_OWNER');
      });

      it('should return false when owner tries to remove themselves (owner role)', () => {
        // This will fail on CANNOT_REMOVE_SELF before CANNOT_REMOVE_OWNER
        const result = canRemoveMember(ownerUser, targetOwner);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_SELF');
      });
    });

    describe('Edge Cases', () => {
      it('should handle target user with undefined role', () => {
        const targetWithUndefinedRole = { id: 'user_test', role: undefined as any };
        const result = canRemoveMember(ownerUser, targetWithUndefinedRole);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should handle target user with null role', () => {
        const targetWithNullRole = { id: 'user_test', role: null as any };
        const result = canRemoveMember(ownerUser, targetWithNullRole);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should handle target user with empty string role', () => {
        const targetWithEmptyRole = { id: 'user_test', role: '' };
        const result = canRemoveMember(ownerUser, targetWithEmptyRole);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should handle matching IDs as strings', () => {
        const targetSameId = { id: 'user_owner', role: 'member' };
        const result = canRemoveMember(ownerUser, targetSameId);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_SELF');
      });
    });

    describe('Permission Hierarchy', () => {
      it('should check NOT_ADMIN before CANNOT_REMOVE_SELF', () => {
        // Member trying to remove themselves
        const selfMember = { id: 'user_member', role: 'member' };
        const result = canRemoveMember(memberUser, selfMember);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('NOT_ADMIN'); // Fails on first check
      });

      it('should check CANNOT_REMOVE_SELF before CANNOT_REMOVE_OWNER', () => {
        // Owner trying to remove themselves (who is also owner)
        const result = canRemoveMember(ownerUser, targetOwner);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('CANNOT_REMOVE_SELF'); // Fails on second check
      });

      it('should allow owner to remove any non-self, non-owner user', () => {
        const regularUser = { id: 'user_regular', role: 'member' };
        const result = canRemoveMember(ownerUser, regularUser);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should allow admin to remove any non-self, non-owner user', () => {
        const regularUser = { id: 'user_regular', role: 'member' };
        const result = canRemoveMember(adminUser, regularUser);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle post lifecycle permissions correctly', () => {
      const post = { authorId: 'user_member' };

      // Author can edit and delete their own post
      expect(canEditPost(memberUser, post)).toBe(true);
      expect(canDeletePost(memberUser, post)).toBe(true);

      // Owner can edit and delete any post
      expect(canEditPost(ownerUser, post)).toBe(true);
      expect(canDeletePost(ownerUser, post)).toBe(true);

      // Admin can edit and delete any post
      expect(canEditPost(adminUser, post)).toBe(true);
      expect(canDeletePost(adminUser, post)).toBe(true);

      // Different member cannot edit or delete
      expect(canEditPost(anotherMemberUser, post)).toBe(false);
      expect(canDeletePost(anotherMemberUser, post)).toBe(false);
    });

    it('should handle comment lifecycle permissions correctly', () => {
      const comment = { authorId: 'user_member' };

      // Author can delete their own comment
      expect(canDeleteComment(memberUser, comment)).toBe(true);

      // Owner can delete any comment
      expect(canDeleteComment(ownerUser, comment)).toBe(true);

      // Admin can delete any comment
      expect(canDeleteComment(adminUser, comment)).toBe(true);

      // Different member cannot delete
      expect(canDeleteComment(anotherMemberUser, comment)).toBe(false);
    });

    it('should handle family member management permissions correctly', () => {
      const targetMember = { id: 'user_member', role: 'member' };
      const targetOwner = { id: 'user_owner', role: 'owner' };
      const targetAdmin = { id: 'user_admin', role: 'admin' };

      // Owner can remove members
      expect(canRemoveMember(ownerUser, targetMember).allowed).toBe(true);

      // Admin can remove members
      expect(canRemoveMember(adminUser, targetMember).allowed).toBe(true);

      // Regular member cannot remove anyone
      expect(canRemoveMember(memberUser, targetMember).allowed).toBe(false);

      // No one can remove the owner
      expect(canRemoveMember(adminUser, targetOwner).allowed).toBe(false);

      // No one can remove themselves
      expect(canRemoveMember(ownerUser, targetOwner).allowed).toBe(false);
      expect(canRemoveMember(adminUser, targetAdmin).allowed).toBe(false);
    });

    it('should maintain consistent permission checks across functions', () => {
      const post = { authorId: 'user_member' };
      const comment = { authorId: 'user_member' };

      // Owner has consistent permissions across all content
      const ownerCanEditPost = canEditPost(ownerUser, post);
      const ownerCanDeletePost = canDeletePost(ownerUser, post);
      const ownerCanDeleteComment = canDeleteComment(ownerUser, comment);

      expect(ownerCanEditPost).toBe(true);
      expect(ownerCanDeletePost).toBe(true);
      expect(ownerCanDeleteComment).toBe(true);

      // Member has consistent permissions for their own content
      const memberCanEditOwnPost = canEditPost(memberUser, post);
      const memberCanDeleteOwnPost = canDeletePost(memberUser, post);
      const memberCanDeleteOwnComment = canDeleteComment(memberUser, comment);

      expect(memberCanEditOwnPost).toBe(true);
      expect(memberCanDeleteOwnPost).toBe(true);
      expect(memberCanDeleteOwnComment).toBe(true);

      // Member cannot access other member's content
      const otherPost = { authorId: 'user_member2' };
      const otherComment = { authorId: 'user_member2' };

      expect(canEditPost(memberUser, otherPost)).toBe(false);
      expect(canDeletePost(memberUser, otherPost)).toBe(false);
      expect(canDeleteComment(memberUser, otherComment)).toBe(false);
    });
  });
});
