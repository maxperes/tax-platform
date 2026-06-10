-- User approval workflow and admin flag

CREATE TYPE "UserStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'pending';

-- Existing accounts keep full access
UPDATE "User" SET "status" = 'approved' WHERE "status" = 'pending';
