ALTER TABLE "SocialIdentity" ADD COLUMN "appleRefreshEncrypted" TEXT,
 ADD COLUMN "appleClientId" TEXT, ADD COLUMN "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
UPDATE "SocialIdentity" SET "authorizedAt"="createdAt";
CREATE TABLE "AppleNoticeReceipt" ("id" CHAR(64) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AppleNoticeReceipt_pkey" PRIMARY KEY ("id"));
