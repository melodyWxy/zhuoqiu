-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "venue_id" TEXT;

-- CreateIndex
CREATE INDEX "matches_venue_id_idx" ON "matches"("venue_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_bracket_matches" ADD CONSTRAINT "tournament_bracket_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
