CREATE TABLE "SocialIdentity" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "provider" VARCHAR(12) NOT NULL,
 "subject" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SocialIdentity_provider_check" CHECK ("provider" IN ('google','apple')),
 CONSTRAINT "SocialIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialIdentity_provider_subject_key" ON "SocialIdentity"("provider","subject");
CREATE UNIQUE INDEX "SocialIdentity_userId_provider_key" ON "SocialIdentity"("userId","provider");
CREATE TABLE "SocialAuthChallenge" (
 "id" UUID NOT NULL, "secretHash" VARCHAR(64) NOT NULL, "provider" VARCHAR(12) NOT NULL,
 "nonce" VARCHAR(64) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "verifiedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SocialAuthChallenge_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SocialAuthChallenge_provider_check" CHECK ("provider" IN ('google','apple'))
);
CREATE INDEX "SocialAuthChallenge_expiresAt_idx" ON "SocialAuthChallenge"("expiresAt");
