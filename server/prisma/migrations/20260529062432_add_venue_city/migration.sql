-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "city" VARCHAR(32);

-- CreateIndex
CREATE INDEX "venues_city_idx" ON "venues"("city");
