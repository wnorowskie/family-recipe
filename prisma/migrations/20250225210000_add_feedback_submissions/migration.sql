-- CreateTable
CREATE TABLE "feedback_submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "family_space_id" TEXT,
    "contact_email" TEXT,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "page_url" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_submissions_family_space_id_idx" ON "feedback_submissions"("family_space_id");

-- CreateIndex
CREATE INDEX "feedback_submissions_user_id_idx" ON "feedback_submissions"("user_id");

-- CreateIndex
CREATE INDEX "feedback_submissions_created_at_idx" ON "feedback_submissions"("created_at");

-- AddForeignKey
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_family_space_id_fkey" FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill relation awareness (no schema change needed beyond foreign keys above)
