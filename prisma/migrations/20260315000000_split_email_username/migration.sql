-- Split email_or_username into dedicated email and username fields (PostgreSQL-safe)
-- Backfill existing data by copying the previous value into both columns

-- 1) Add new columns (nullable initially for backfill)
ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- 2) Backfill from legacy column
UPDATE "users"
SET
  "email" = "email_or_username",
  "username" = REGEXP_REPLACE("email_or_username", '[^a-zA-Z0-9_]', '', 'g');

-- 3) Enforce NOT NULL
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- 4) Replace unique index on legacy column with new ones
DROP INDEX IF EXISTS "users_email_or_username_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
