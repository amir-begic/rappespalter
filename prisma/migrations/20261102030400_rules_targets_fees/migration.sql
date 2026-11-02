-- AlterTable
ALTER TABLE "FundConstituent" ADD COLUMN "currency" TEXT;

-- AlterTable
ALTER TABLE "Security" ADD COLUMN "targetWeight" REAL;
ALTER TABLE "Security" ADD COLUMN "ter" REAL;

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "direction" TEXT NOT NULL DEFAULT 'any',
    "categoryId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
