-- Create notifications table
CREATE TABLE "notifications" (
  "id" TEXT PRIMARY KEY,
  "family_space_id" TEXT NOT NULL,
  "recipient_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "comment_id" TEXT,
  "cooked_event_id" TEXT,
  "emoji_counts" JSONB,
  "total_count" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ
);

-- Foreign keys
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_family_space_id_fkey"
    FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "notifications_cooked_event_id_fkey"
    FOREIGN KEY ("cooked_event_id") REFERENCES "cooked_events"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "notifications_recipient_read_idx"
  ON "notifications" ("recipient_id", "read_at", "created_at");

CREATE INDEX "notifications_family_post_idx"
  ON "notifications" ("family_space_id", "post_id");
