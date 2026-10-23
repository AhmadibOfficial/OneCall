-- Activate only accounts waiting for the retired SMS verification requirement.
-- Suspended, deleted and email-unverified accounts remain unchanged.
UPDATE "User"
SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING' AND "emailVerified" = true AND "deletedAt" IS NULL;
