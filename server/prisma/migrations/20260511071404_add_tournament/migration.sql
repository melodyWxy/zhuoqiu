-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('single_elim', 'double_elim', 'round_robin', 'swiss');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('draft', 'registering', 'registration_closed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('confirmed', 'withdrawn', 'disqualified');

-- CreateEnum
CREATE TYPE "BracketMatchStatus" AS ENUM ('pending', 'ready', 'in_progress', 'completed', 'walkover');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "game_type" "MatchType" NOT NULL,
    "format" "TournamentFormat" NOT NULL DEFAULT 'single_elim',
    "rules_json" JSONB NOT NULL,
    "max_players" SMALLINT NOT NULL,
    "min_players" SMALLINT NOT NULL DEFAULT 4,
    "entry_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "prize_pool_text" TEXT,
    "registration_starts_at" TIMESTAMP(3) NOT NULL,
    "registration_ends_at" TIMESTAMP(3) NOT NULL,
    "match_starts_at" TIMESTAMP(3) NOT NULL,
    "cover_image" VARCHAR(512),
    "notice_text" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'draft',
    "created_by_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_registrations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" VARCHAR(32) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "seed" SMALLINT,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'confirmed',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_bracket_matches" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "round" SMALLINT NOT NULL,
    "slot_in_round" SMALLINT NOT NULL,
    "player_a_registration_id" TEXT,
    "player_b_registration_id" TEXT,
    "match_id" TEXT,
    "winner_registration_id" TEXT,
    "status" "BracketMatchStatus" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_bracket_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_venue_id_status_idx" ON "tournaments"("venue_id", "status");

-- CreateIndex
CREATE INDEX "tournaments_status_registration_ends_at_idx" ON "tournaments"("status", "registration_ends_at");

-- CreateIndex
CREATE INDEX "tournaments_created_by_account_id_idx" ON "tournaments"("created_by_account_id");

-- CreateIndex
CREATE INDEX "tournament_registrations_user_id_idx" ON "tournament_registrations"("user_id");

-- CreateIndex
CREATE INDEX "tournament_registrations_tournament_id_status_idx" ON "tournament_registrations"("tournament_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_user_id_key" ON "tournament_registrations"("tournament_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_bracket_matches_match_id_key" ON "tournament_bracket_matches"("match_id");

-- CreateIndex
CREATE INDEX "tournament_bracket_matches_tournament_id_round_idx" ON "tournament_bracket_matches"("tournament_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_bracket_matches_tournament_id_round_slot_in_roun_key" ON "tournament_bracket_matches"("tournament_id", "round", "slot_in_round");

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_player_a_registration_id_fkey" FOREIGN KEY ("player_a_registration_id") REFERENCES "tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_player_b_registration_id_fkey" FOREIGN KEY ("player_b_registration_id") REFERENCES "tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_winner_registration_id_fkey" FOREIGN KEY ("winner_registration_id") REFERENCES "tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
