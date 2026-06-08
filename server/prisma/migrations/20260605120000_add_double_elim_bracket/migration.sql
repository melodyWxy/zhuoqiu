-- CreateEnum
CREATE TYPE "BracketGroup" AS ENUM ('winners', 'losers', 'grand_final');

-- CreateEnum
CREATE TYPE "BracketSlot" AS ENUM ('A', 'B');

-- DropIndex
DROP INDEX "tournament_bracket_matches_tournament_id_round_idx";

-- DropIndex
DROP INDEX "tournament_bracket_matches_tournament_id_round_slot_in_roun_key";

-- AlterTable
ALTER TABLE "tournament_bracket_matches" ADD COLUMN     "bracket_group" "BracketGroup" NOT NULL DEFAULT 'winners',
ADD COLUMN     "loser_to_match_id" TEXT,
ADD COLUMN     "loser_to_slot" "BracketSlot",
ADD COLUMN     "slot_a_settled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slot_b_settled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "winner_to_match_id" TEXT,
ADD COLUMN     "winner_to_slot" "BracketSlot";

-- CreateIndex
CREATE INDEX "tournament_bracket_matches_tournament_id_bracket_group_roun_idx" ON "tournament_bracket_matches"("tournament_id", "bracket_group", "round");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_bracket_matches_tournament_id_bracket_group_roun_key" ON "tournament_bracket_matches"("tournament_id", "bracket_group", "round", "slot_in_round");
