-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayName" VARCHAR(120),
ADD COLUMN     "vehicleDescription" VARCHAR(160);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cityKey" VARCHAR(60) NOT NULL DEFAULT 'kaduna',
ADD COLUMN     "destinationAddress" VARCHAR(300),
ADD COLUMN     "pickupAddress" VARCHAR(300),
ADD COLUMN     "quoteRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "state" VARCHAR(40) NOT NULL DEFAULT 'Kaduna',
ADD COLUMN     "vehicleType" VARCHAR(20);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "method" VARCHAR(20);

-- CreateTable
CREATE TABLE "ProviderCoverage" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "state" VARCHAR(40) NOT NULL,
    "cityKey" VARCHAR(60) NOT NULL,
    "serviceName" VARCHAR(120) NOT NULL,

    CONSTRAINT "ProviderCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "serviceName" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderQuote" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLocation" (
    "orderId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLocation_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "OrderMessage" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balanceKobo" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "reference" VARCHAR(160) NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutIntent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderId" UUID,
    "amountKobo" BIGINT NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "checkoutUrl" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'INITIALIZING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subject" VARCHAR(120) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCoverage_state_cityKey_serviceName_idx" ON "ProviderCoverage"("state", "cityKey", "serviceName");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCoverage_providerId_state_cityKey_serviceName_key" ON "ProviderCoverage"("providerId", "state", "cityKey", "serviceName");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_serviceName_key" ON "Favorite"("userId", "serviceName");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderQuote_orderId_key" ON "OrderQuote"("orderId");

-- CreateIndex
CREATE INDEX "OrderMessage_orderId_createdAt_idx" ON "OrderMessage"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_reference_key" ON "WalletEntry"("reference");

-- CreateIndex
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_reference_key" ON "CheckoutIntent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_idempotencyKey_key" ON "CheckoutIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckoutIntent_userId_createdAt_idx" ON "CheckoutIntent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutIntent_orderId_status_idx" ON "CheckoutIntent"("orderId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_state_cityKey_serviceName_status_idx" ON "Order"("state", "cityKey", "serviceName", "status");

-- AddForeignKey
ALTER TABLE "ProviderCoverage" ADD CONSTRAINT "ProviderCoverage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderQuote" ADD CONSTRAINT "OrderQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLocation" ADD CONSTRAINT "OrderLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Providers provisioned before this migration were created by a trusted operator.
-- Preserve only their original Kaduna catalogue scope; new applications default to unapproved.
UPDATE "Provider" p SET "approved" = true FROM "User" u
WHERE p."userId" = u."id" AND u."status" = 'ACTIVE' AND u."deletedAt" IS NULL
  AND u."emailVerified" = true AND u."phoneVerified" = true;
INSERT INTO "ProviderCoverage" ("id", "providerId", "state", "cityKey", "serviceName")
SELECT md5(p."id"::text || ':kaduna:' || s.name)::uuid, p."id", 'Kaduna', 'kaduna', s.name
FROM "Provider" p CROSS JOIN (VALUES ('Tailoring'), ('Mechanic'), ('Shoe repair'), ('Provisions'),
 ('Soup ingredients'), ('Solar installation'), ('Carpentry'), ('Painting')) s(name)
WHERE p."approved" = true;
UPDATE "Order" SET "serviceName" = 'Solar installation' WHERE lower("serviceName") = 'solar installation';

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_nonnegative" CHECK ("balanceKobo" >= 0);
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_nonzero" CHECK ("amountKobo" <> 0);
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_positive_amount" CHECK ("amountKobo" > 0 AND "amountKobo" <= 999999999);
ALTER TABLE "CheckoutIntent" ADD CONSTRAINT "CheckoutIntent_status_valid" CHECK ("status" IN ('INITIALIZING', 'PENDING', 'SUCCEEDED'));
ALTER TABLE "OrderQuote" ADD CONSTRAINT "OrderQuote_positive_amount" CHECK ("amount" > 0 AND "amount" <= 9999999.99);
ALTER TABLE "OrderLocation" ADD CONSTRAINT "OrderLocation_coordinates_valid" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "accuracy" BETWEEN 0 AND 10000);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_method_valid" CHECK ("method" IS NULL OR "method" IN ('WALLET', 'PAYSTACK'));
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_status_valid" CHECK ("status" IN ('OPEN', 'RESOLVED'));
-- Older accounts may have more than one default address. Keep the most recent.
WITH ranked AS (SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC, "id") n FROM "Address" WHERE "isDefault")
UPDATE "Address" a SET "isDefault" = false FROM ranked r WHERE a."id" = r."id" AND r.n > 1;
CREATE UNIQUE INDEX "Address_one_default_per_user" ON "Address" ("userId") WHERE "isDefault";
