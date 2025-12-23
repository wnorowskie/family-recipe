-- Clean up legacy column now that email/username are in use
-- Postgres-safe: drops the old email_or_username column if it still exists

-- Drop legacy unique index if it remains
DROP INDEX IF EXISTS "users_email_or_username_key";

-- Drop the legacy column
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_or_username";
