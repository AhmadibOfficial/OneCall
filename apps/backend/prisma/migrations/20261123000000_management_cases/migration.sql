ALTER TABLE "SupportTicket" ADD COLUMN "assignedToId" UUID, ADD COLUMN "dueAt" TIMESTAMP(3), ADD COLUMN "priority" VARCHAR(12) NOT NULL DEFAULT 'NORMAL';
CREATE INDEX "SupportTicket_status_dueAt_idx" ON "SupportTicket"("status", "dueAt");
CREATE TABLE "ServiceSetting" ("key" VARCHAR(60) NOT NULL, "description" VARCHAR(500) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ServiceSetting_pkey" PRIMARY KEY ("key"));
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_status_valid";
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_status_valid" CHECK ("status" IN ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED'));
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_priority_valid" CHECK ("priority" IN ('NORMAL', 'HIGH', 'URGENT'));
ALTER TABLE "Provider" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
