-- Additional indexes for common query patterns

CREATE INDEX "idx_posts_family_created" ON "posts"("family_space_id", "created_at");
CREATE INDEX "idx_posts_author" ON "posts"("author_id");

CREATE INDEX "idx_comments_post_created" ON "comments"("post_id", "created_at");

CREATE INDEX "idx_reactions_target" ON "reactions"("target_type", "target_id");
CREATE INDEX "idx_reactions_post" ON "reactions"("post_id");
CREATE INDEX "idx_reactions_comment" ON "reactions"("comment_id");

CREATE INDEX "idx_favorites_user" ON "favorites"("user_id");
CREATE INDEX "idx_favorites_post" ON "favorites"("post_id");

CREATE INDEX "idx_cooked_events_post" ON "cooked_events"("post_id");
CREATE INDEX "idx_cooked_events_user" ON "cooked_events"("user_id");

CREATE INDEX "idx_post_photos_post" ON "post_photos"("post_id");

CREATE INDEX "idx_post_tags_post" ON "post_tags"("post_id");
CREATE INDEX "idx_post_tags_tag" ON "post_tags"("tag_id");

CREATE INDEX "idx_family_memberships_family" ON "family_memberships"("family_space_id");
