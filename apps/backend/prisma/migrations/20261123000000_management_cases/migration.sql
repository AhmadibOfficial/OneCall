ALTER TABLE "SupportTicket" ADD COLUMN "assignedToId" UUID, ADD COLUMN "dueAt" TIMESTAMP(3), ADD COLUMN "priority" VARCHAR(12) NOT NULL DEFAULT 'NORMAL';
CREATE INDEX "SupportTicket_status_dueAt_idx" ON "SupportTicket"("status", "dueAt");
CREATE TABLE "ServiceSetting" ("key" VARCHAR(60) NOT NULL, "description" VARCHAR(500) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ServiceSetting_pkey" PRIMARY KEY ("key"));
