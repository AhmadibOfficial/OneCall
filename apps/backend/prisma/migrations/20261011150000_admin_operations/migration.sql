CREATE TABLE "AdminOperation" (
 "id" UUID NOT NULL, "actorId" UUID NOT NULL, "action" VARCHAR(60) NOT NULL,
 "resourceId" UUID NOT NULL, "reason" VARCHAR(500) NOT NULL, "details" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdminOperation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminOperation_resourceId_createdAt_idx" ON "AdminOperation"("resourceId", "createdAt");
CREATE INDEX "AdminOperation_actorId_createdAt_idx" ON "AdminOperation"("actorId", "createdAt");
