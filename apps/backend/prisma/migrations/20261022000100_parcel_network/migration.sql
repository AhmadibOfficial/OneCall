-- CreateEnum
CREATE TYPE "ParcelAgentStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ParcelRouteStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'AT_ORIGIN', 'IN_TRANSIT', 'READY_FOR_COLLECTION', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURN_IN_TRANSIT', 'READY_FOR_RETURN', 'RETURNED');

-- CreateTable
CREATE TABLE "ParcelAgent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shopName" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "state" VARCHAR(40) NOT NULL,
    "city" VARCHAR(60) NOT NULL,
    "cityKey" VARCHAR(60) NOT NULL,
    "status" "ParcelAgentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReference" VARCHAR(120),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelRoute" (
    "id" UUID NOT NULL,
    "originAgentId" UUID NOT NULL,
    "destinationAgentId" UUID NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "maxWeightGrams" INTEGER NOT NULL,
    "estimatedHours" INTEGER NOT NULL,
    "homePickup" BOOLEAN NOT NULL DEFAULT false,
    "homePickupFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "status" "ParcelRouteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelShipment" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "senderId" UUID NOT NULL,
    "clientReference" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "routeId" UUID NOT NULL,
    "originAgentId" UUID NOT NULL,
    "destinationAgentId" UUID NOT NULL,
    "recipientName" VARCHAR(120) NOT NULL,
    "recipientPhone" VARCHAR(20) NOT NULL,
    "recipientId" UUID,
    "description" VARCHAR(1000) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "pickupMode" VARCHAR(20) NOT NULL,
    "pickupAddress" VARCHAR(300),
    "priceKobo" INTEGER NOT NULL,
    "policyVersion" VARCHAR(40) NOT NULL DEFAULT 'parcel-pilot-v1',
    "status" "ParcelStatus" NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "codeHash" CHAR(64),
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codePurpose" VARCHAR(10),
    "codeIssues" INTEGER NOT NULL DEFAULT 0,
    "codeIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelEvent" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParcelAgent_userId_key" ON "ParcelAgent"("userId");

-- CreateIndex
CREATE INDEX "ParcelAgent_status_state_cityKey_idx" ON "ParcelAgent"("status", "state", "cityKey");

-- CreateIndex
CREATE INDEX "ParcelRoute_originAgentId_status_idx" ON "ParcelRoute"("originAgentId", "status");

-- CreateIndex
CREATE INDEX "ParcelRoute_destinationAgentId_status_idx" ON "ParcelRoute"("destinationAgentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelShipment_reference_key" ON "ParcelShipment"("reference");

-- CreateIndex
CREATE INDEX "ParcelShipment_senderId_createdAt_idx" ON "ParcelShipment"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "ParcelShipment_recipientPhone_createdAt_idx" ON "ParcelShipment"("recipientPhone", "createdAt");

-- CreateIndex
CREATE INDEX "ParcelShipment_recipientId_createdAt_idx" ON "ParcelShipment"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "ParcelShipment_originAgentId_status_idx" ON "ParcelShipment"("originAgentId", "status");

-- CreateIndex
CREATE INDEX "ParcelShipment_destinationAgentId_status_idx" ON "ParcelShipment"("destinationAgentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelShipment_senderId_clientReference_key" ON "ParcelShipment"("senderId", "clientReference");

-- CreateIndex
CREATE INDEX "ParcelEvent_shipmentId_createdAt_idx" ON "ParcelEvent"("shipmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ParcelAgent" ADD CONSTRAINT "ParcelAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelRoute" ADD CONSTRAINT "ParcelRoute_originAgentId_fkey" FOREIGN KEY ("originAgentId") REFERENCES "ParcelAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelRoute" ADD CONSTRAINT "ParcelRoute_destinationAgentId_fkey" FOREIGN KEY ("destinationAgentId") REFERENCES "ParcelAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ParcelRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_originAgentId_fkey" FOREIGN KEY ("originAgentId") REFERENCES "ParcelAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_destinationAgentId_fkey" FOREIGN KEY ("destinationAgentId") REFERENCES "ParcelAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelEvent" ADD CONSTRAINT "ParcelEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ParcelShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelEvent" ADD CONSTRAINT "ParcelEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Enforce money, capacity and identity invariants even outside HTTP DTO validation.
ALTER TABLE "ParcelRoute" ADD CONSTRAINT "ParcelRoute_bounds" CHECK (
  "originAgentId" <> "destinationAgentId" AND
  "priceKobo" BETWEEN 100 AND 100000000 AND
  "maxWeightGrams" BETWEEN 100 AND 50000 AND
  "estimatedHours" BETWEEN 1 AND 336 AND
  "homePickupFeeKobo" BETWEEN 0 AND 10000000 AND
  ("homePickup" OR "homePickupFeeKobo" = 0)
);
ALTER TABLE "ParcelShipment" ADD CONSTRAINT "ParcelShipment_bounds" CHECK (
  "priceKobo" BETWEEN 100 AND 110000000 AND
  "weightGrams" BETWEEN 100 AND 50000 AND "version" >= 0 AND
  "codeAttempts" BETWEEN 0 AND 5 AND "codeIssues" BETWEEN 0 AND 3 AND
  "pickupMode" IN ('SHOP_DROP_OFF', 'HOME_PICKUP') AND
  ("pickupMode" <> 'HOME_PICKUP' OR length(trim("pickupAddress")) >= 5 AND "pickupAddress" IS NOT NULL)
);
