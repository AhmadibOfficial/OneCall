CREATE TABLE "BookingPhoto" (
 "id" UUID NOT NULL, "orderId" UUID NOT NULL, "uploaderId" UUID NOT NULL, "storageKey" VARCHAR(255) NOT NULL,
 "mime" VARCHAR(100) NOT NULL, "byteSize" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BookingPhoto_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BookingPhoto_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 5242880),
 CONSTRAINT "BookingPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "BookingPhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingPhoto_storageKey_key" ON "BookingPhoto"("storageKey");
CREATE INDEX "BookingPhoto_orderId_idx" ON "BookingPhoto"("orderId");
CREATE INDEX "BookingPhoto_uploaderId_createdAt_idx" ON "BookingPhoto"("uploaderId","createdAt");
