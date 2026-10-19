-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('AVATAR');

-- CreateTable
CREATE TABLE "StoredUpload" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "detectedMime" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredUpload_storageKey_key" ON "StoredUpload"("storageKey");

-- CreateIndex
CREATE INDEX "StoredUpload_ownerId_idx" ON "StoredUpload"("ownerId");

-- CreateIndex
CREATE INDEX "StoredUpload_purpose_idx" ON "StoredUpload"("purpose");

-- CreateIndex
CREATE INDEX "StoredUpload_createdAt_idx" ON "StoredUpload"("createdAt");

-- AddForeignKey
ALTER TABLE "StoredUpload" ADD CONSTRAINT "StoredUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
