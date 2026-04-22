-- Align live schema with Prisma-generated DDL so `prisma migrate diff` is empty.
-- The two sources of drift this migration clears:
--   1. 14 pre-Prisma indexes still named `idx_*` from 20251205094500_add_core_indexes;
--      Prisma generates `<table>_<cols>_idx` names for the equivalent `@@index([...])`.
--   2. notifications FKs created in 20251223150000_add_notifications as a single
--      multi-clause ALTER TABLE without `ON UPDATE CASCADE` and in a different
--      order than the Prisma schema; Prisma's default is `ON UPDATE CASCADE` and
--      its canonical order follows the relation declaration order in the model.

-- RenameIndex
ALTER INDEX "idx_comments_post_created" RENAME TO "comments_post_id_created_at_idx";
ALTER INDEX "idx_cooked_events_post" RENAME TO "cooked_events_post_id_idx";
ALTER INDEX "idx_cooked_events_user" RENAME TO "cooked_events_user_id_idx";
ALTER INDEX "idx_family_memberships_family" RENAME TO "family_memberships_family_space_id_idx";
ALTER INDEX "idx_favorites_post" RENAME TO "favorites_post_id_idx";
ALTER INDEX "idx_favorites_user" RENAME TO "favorites_user_id_idx";
ALTER INDEX "idx_post_photos_post" RENAME TO "post_photos_post_id_idx";
ALTER INDEX "idx_post_tags_post" RENAME TO "post_tags_post_id_idx";
ALTER INDEX "idx_post_tags_tag" RENAME TO "post_tags_tag_id_idx";
ALTER INDEX "idx_posts_author" RENAME TO "posts_author_id_idx";
ALTER INDEX "idx_posts_family_created" RENAME TO "posts_family_space_id_created_at_idx";
ALTER INDEX "idx_reactions_comment" RENAME TO "reactions_comment_id_idx";
ALTER INDEX "idx_reactions_post" RENAME TO "reactions_post_id_idx";
ALTER INDEX "idx_reactions_target" RENAME TO "reactions_target_type_target_id_idx";

-- Recreate notifications FKs in the Prisma-canonical order with ON UPDATE CASCADE.
-- Primary keys are text cuids and never update in practice, so the ON UPDATE
-- change is inert for this table; we set it to match the schema for drift purity.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_recipient_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_actor_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_post_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_comment_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_cooked_event_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_family_space_id_fkey";

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cooked_event_id_fkey" FOREIGN KEY ("cooked_event_id") REFERENCES "cooked_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_family_space_id_fkey" FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
