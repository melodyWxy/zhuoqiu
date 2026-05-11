-- CreateEnum
CREATE TYPE "VenueAccountRole" AS ENUM ('owner', 'staff');

-- CreateEnum
CREATE TYPE "VenueAccountStatus" AS ENUM ('active', 'banned');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "VenueApplicationStatus" AS ENUM ('draft', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VenueApplicationSource" AS ENUM ('c_app', 'admin_web');

-- AlterEnum
ALTER TYPE "PhoneCodePurpose" ADD VALUE 'venue_login';

-- CreateTable
CREATE TABLE "venue_accounts" (
    "id" TEXT NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "nickname" VARCHAR(32) NOT NULL,
    "role" "VenueAccountRole" NOT NULL DEFAULT 'owner',
    "venue_id" TEXT,
    "status" "VenueAccountStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "slug" VARCHAR(64),
    "address" VARCHAR(255) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" VARCHAR(32) NOT NULL,
    "cover_image" VARCHAR(512),
    "tables_count" SMALLINT NOT NULL DEFAULT 0,
    "open_hours_json" JSONB,
    "description" TEXT,
    "owner_account_id" TEXT NOT NULL,
    "status" "VenueStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_applications" (
    "id" TEXT NOT NULL,
    "applicant_account_id" TEXT NOT NULL,
    "source" "VenueApplicationSource" NOT NULL DEFAULT 'admin_web',
    "payload_json" JSONB NOT NULL,
    "license_image" VARCHAR(512),
    "id_card_image" VARCHAR(512),
    "status" "VenueApplicationStatus" NOT NULL DEFAULT 'draft',
    "reject_reason" TEXT,
    "reviewed_by_admin_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "venue_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_accounts_phone_number_key" ON "venue_accounts"("phone_number");

-- CreateIndex
CREATE INDEX "venue_accounts_status_idx" ON "venue_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "venues_owner_account_id_key" ON "venues"("owner_account_id");

-- CreateIndex
CREATE INDEX "venues_name_idx" ON "venues"("name");

-- CreateIndex
CREATE INDEX "venues_status_idx" ON "venues"("status");

-- CreateIndex
CREATE INDEX "venue_applications_applicant_account_id_idx" ON "venue_applications"("applicant_account_id");

-- CreateIndex
CREATE INDEX "venue_applications_status_idx" ON "venue_applications"("status");

-- CreateIndex
CREATE INDEX "venue_applications_created_at_idx" ON "venue_applications"("created_at");

-- AddForeignKey
ALTER TABLE "venue_accounts" ADD CONSTRAINT "venue_accounts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "venue_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_applications" ADD CONSTRAINT "venue_applications_applicant_account_id_fkey" FOREIGN KEY ("applicant_account_id") REFERENCES "venue_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
