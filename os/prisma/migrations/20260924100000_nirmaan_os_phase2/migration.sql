-- AlterTable
ALTER TABLE "Project" ADD COLUMN "aiBudgetUsd" REAL;
ALTER TABLE "Project" ADD COLUMN "ciTokenHash" TEXT;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "summary" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "usageId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "link" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "runRef" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Evidence" ("id", "link", "passed", "recordedAt", "recordedBy", "result", "summary", "testCaseId", "total") SELECT "id", "link", "passed", "recordedAt", "recordedBy", "result", "summary", "testCaseId", "total" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE UNIQUE INDEX "Evidence_testCaseId_runRef_key" ON "Evidence"("testCaseId", "runRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AgentRun_projectId_kind_idx" ON "AgentRun"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ciTokenHash_key" ON "Project"("ciTokenHash");

