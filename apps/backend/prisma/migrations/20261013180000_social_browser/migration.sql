ALTER TABLE "SocialAuthChallenge" ADD COLUMN "browser" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "bindingUserId" UUID, ADD COLUMN "bindingVersion" INTEGER, ADD COLUMN "resultEncrypted" TEXT, ADD COLUMN "deliveredAt" TIMESTAMP(3);
