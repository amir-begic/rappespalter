-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "importId" INTEGER;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,
    "changes" TEXT
);

-- CreateIndex
CREATE INDEX "Transaction_importId_idx" ON "Transaction"("importId");
