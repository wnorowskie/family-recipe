-- Idempotency-key store for X-Request-Id replay (FastAPI Phase 3-A2)
-- Issue: https://github.com/wnorowskie/family-recipe/issues/180

CREATE TABLE "idempotency_keys" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "response_body" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idempotency_keys_user_id_request_id_key" ON "idempotency_keys" ("user_id", "request_id");
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" ("created_at");
