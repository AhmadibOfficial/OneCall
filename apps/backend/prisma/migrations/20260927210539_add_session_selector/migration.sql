/*
  Warnings:

  - A unique constraint covering the columns `[selector]` on the table `PasswordResetToken` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[selector]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[selector]` on the table `VerificationToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `selector` to the `PasswordResetToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selector` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selector` to the `VerificationToken` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PasswordResetToken_tokenHash_key";

-- DropIndex
DROP INDEX "Session_tokenHash_key";

-- DropIndex
DROP INDEX "VerificationToken_tokenHash_key";

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "selector" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "selector" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "selector" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_selector_key" ON "PasswordResetToken"("selector");

-- CreateIndex
CREATE UNIQUE INDEX "Session_selector_key" ON "Session"("selector");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_selector_key" ON "VerificationToken"("selector");
