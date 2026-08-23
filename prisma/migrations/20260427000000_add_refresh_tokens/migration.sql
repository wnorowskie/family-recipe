-- Refresh-token store for FastAPI Phase 1 token auth
-- Design: docs/research/refresh-token-store.md
-- Issue: https://github.com/wnorowskie/family-recipe/issues/35

CREATE TABLE "refresh_tokens" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "family_space_id" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "chain_id" TEXT NOT NULL,
  "rotated_from_jti" TEXT,
  "remember_me" BOOLEAN NOT NULL DEFAULT FALSE,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" TEXT,
  "user_agent" TEXT,
  "ip_address" TEXT
);

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "refresh_tokens_family_space_id_fkey"
    FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens" ("jti");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens" ("user_id", "revoked_at");
CREATE INDEX "refresh_tokens_chain_id_idx" ON "refresh_tokens" ("chain_id");
CREATE INDEX "refresh_tokens_family_space_id_idx" ON "refresh_tokens" ("family_space_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens" ("revoked_at");
