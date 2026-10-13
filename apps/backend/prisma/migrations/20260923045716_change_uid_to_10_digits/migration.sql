/*
  Warnings:

  - You are about to alter the column `uid` on the `User` table. The data in the column could be lost. The data in the column will be cast from `VarChar(12)` to `VarChar(10)`.
*/

ALTER TABLE "User" ALTER COLUMN "uid" SET DATA TYPE VARCHAR(10);
