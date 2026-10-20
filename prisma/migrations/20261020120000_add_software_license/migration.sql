-- CreateTable
CREATE TABLE "SoftwareLicense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machineId" TEXT NOT NULL,
    "activationHash" TEXT NOT NULL,
    "activatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "termIndex" INTEGER NOT NULL DEFAULT 1,
    "signature" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
