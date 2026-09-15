-- Add user theme preference ('grayscale' | 'warm'), default 'grayscale' (#155)
ALTER TABLE "users" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'grayscale';
