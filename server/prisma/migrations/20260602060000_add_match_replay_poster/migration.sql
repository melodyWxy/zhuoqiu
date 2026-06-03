-- v2.22 战报海报系统 (prd/match-replay.md C-1)
-- 给 matches 表加 5 列，记录海报生成状态 / OSS URL / 失败原因

-- CreateEnum
CREATE TYPE "ReplayStatus" AS ENUM ('pending', 'ready', 'failed');

-- AlterTable
ALTER TABLE "matches"
    ADD COLUMN "replay_status"        "ReplayStatus",
    ADD COLUMN "replay_poster_url"    TEXT,
    ADD COLUMN "replay_qr_url"        TEXT,
    ADD COLUMN "replay_generated_at"  TIMESTAMP(3),
    ADD COLUMN "replay_failed_reason" VARCHAR(500);

-- 索引：on-startup 扫长时间 pending 用
CREATE INDEX "matches_replay_status_ended_at_idx"
    ON "matches" ("replay_status", "ended_at");
