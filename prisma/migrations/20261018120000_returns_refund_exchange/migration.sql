-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'EXCHANGE');

-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SalesReturnItem" ADD COLUMN "resolution" "ReturnResolution" NOT NULL DEFAULT 'REFUND',
ADD COLUMN "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "refundTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "costReversed" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "replacementProductId" TEXT,
ADD COLUMN "replacementQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SalesReturn_approvedAt_idx" ON "SalesReturn"("approvedAt");

-- Backfill: returns approved before this migration get their approval date.
UPDATE "SalesReturn"
SET "approvedAt" = "updatedAt"
WHERE "status" = 'COMPLETED' AND "approvedAt" IS NULL;
