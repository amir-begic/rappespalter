-- CreateTable
CREATE TABLE "TransactionMark" (
    "transactionId" INTEGER NOT NULL PRIMARY KEY,
    "oneOff" BOOLEAN NOT NULL DEFAULT false,
    "categorySource" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "TransactionMark_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
