-- Verification facts are preserved. Suspended and deleted accounts stay blocked.
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
UPDATE "User" SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING' AND "deletedAt" IS NULL;
