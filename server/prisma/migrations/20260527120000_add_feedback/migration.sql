-- 用户反馈：帮助与反馈入口的存储

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('bug', 'suggestion', 'cooperation');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'resolved');

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "FeedbackType" NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" VARCHAR(64),

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- CreateIndex
CREATE INDEX "feedbacks_type_idx" ON "feedbacks"("type");

-- CreateIndex
CREATE INDEX "feedbacks_created_at_idx" ON "feedbacks"("created_at");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
