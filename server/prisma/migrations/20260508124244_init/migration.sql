-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'banned', 'deleted');

-- CreateEnum
CREATE TYPE "PrimarySource" AS ENUM ('wechat', 'douyin', 'phone');

-- CreateEnum
CREATE TYPE "PhoneCodePurpose" AS ENUM ('login', 'bind', 'merge');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'operator', 'readonly');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('nine_ball', 'eight_ball');

-- CreateEnum
CREATE TYPE "MatchState" AS ENUM ('waiting', 'in_progress', 'paused', 'ended', 'dissolved');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone_number" VARCHAR(20),
    "nickname" VARCHAR(32) NOT NULL,
    "avatar" VARCHAR(32) NOT NULL DEFAULT '🎱',
    "primary_source" "PrimarySource" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "ban_until" TIMESTAMP(3),
    "ban_reason" TEXT,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_bindings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "open_id" VARCHAR(128) NOT NULL,
    "union_id" VARCHAR(128),
    "mp_app_id" VARCHAR(64) NOT NULL,
    "bind_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "douyin_bindings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "open_id" VARCHAR(128) NOT NULL,
    "union_id" VARCHAR(128),
    "mp_app_id" VARCHAR(64) NOT NULL,
    "bind_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "douyin_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_verify_codes" (
    "id" BIGSERIAL NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "purpose" "PhoneCodePurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verify_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "AdminRole" NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" VARCHAR(45),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(6),
    "owner_user_id" TEXT NOT NULL,
    "type" "MatchType" NOT NULL,
    "rules_json" JSONB NOT NULL,
    "state" "MatchState" NOT NULL DEFAULT 'waiting',
    "timer_started_at" TIMESTAMP(3),
    "timer_accumulated_ms" BIGINT NOT NULL DEFAULT 0,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "last_event_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "ended_by" VARCHAR(32),
    "ended_reason" VARCHAR(255),
    "event_id" VARCHAR(32),
    "bracket_node_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "id" BIGSERIAL NOT NULL,
    "match_id" TEXT NOT NULL,
    "slot" SMALLINT NOT NULL,
    "display_name" VARCHAR(32) NOT NULL,
    "user_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" BIGSERIAL NOT NULL,
    "match_id" TEXT NOT NULL,
    "server_seq" BIGINT NOT NULL,
    "client_seq" BIGINT,
    "actor_user_id" TEXT,
    "actor_admin_id" TEXT,
    "type" VARCHAR(32) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "undone_by_event_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_admin_id" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32),
    "target_id" VARCHAR(64),
    "detail_json" JSONB NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(64) NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "wechat_bindings_union_id_idx" ON "wechat_bindings"("union_id");

-- CreateIndex
CREATE INDEX "wechat_bindings_user_id_idx" ON "wechat_bindings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_bindings_mp_app_id_open_id_key" ON "wechat_bindings"("mp_app_id", "open_id");

-- CreateIndex
CREATE INDEX "douyin_bindings_union_id_idx" ON "douyin_bindings"("union_id");

-- CreateIndex
CREATE INDEX "douyin_bindings_user_id_idx" ON "douyin_bindings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "douyin_bindings_mp_app_id_open_id_key" ON "douyin_bindings"("mp_app_id", "open_id");

-- CreateIndex
CREATE INDEX "phone_verify_codes_phone_number_purpose_expires_at_idx" ON "phone_verify_codes"("phone_number", "purpose", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_accounts_username_key" ON "admin_accounts"("username");

-- CreateIndex
CREATE INDEX "admin_accounts_role_idx" ON "admin_accounts"("role");

-- CreateIndex
CREATE UNIQUE INDEX "matches_code_key" ON "matches"("code");

-- CreateIndex
CREATE INDEX "matches_state_idx" ON "matches"("state");

-- CreateIndex
CREATE INDEX "matches_owner_user_id_idx" ON "matches"("owner_user_id");

-- CreateIndex
CREATE INDEX "matches_created_at_idx" ON "matches"("created_at");

-- CreateIndex
CREATE INDEX "match_players_match_id_slot_idx" ON "match_players"("match_id", "slot");

-- CreateIndex
CREATE INDEX "match_players_user_id_idx" ON "match_players"("user_id");

-- CreateIndex
CREATE INDEX "match_events_match_id_created_at_idx" ON "match_events"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "match_events_actor_user_id_idx" ON "match_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_match_id_server_seq_key" ON "match_events"("match_id", "server_seq");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actor_admin_id_idx" ON "admin_audit_logs"("actor_admin_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_id_idx" ON "admin_audit_logs"("target_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "wechat_bindings" ADD CONSTRAINT "wechat_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "douyin_bindings" ADD CONSTRAINT "douyin_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
