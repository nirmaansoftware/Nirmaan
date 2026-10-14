-- CreateTable
CREATE TABLE "Autopilot" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'autopilot',
    "on" BOOLEAN NOT NULL DEFAULT false,
    "newContactsPerDay" INTEGER NOT NULL DEFAULT 100,
    "emailShare" INTEGER NOT NULL DEFAULT 50,
    "cities" TEXT NOT NULL DEFAULT '["Ahmedabad","Surat","Vadodara","Rajkot","Gandhinagar","Bhavnagar"]',
    "weights" TEXT NOT NULL DEFAULT '{}',
    "lastReviewAt" DATETIME,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutopilotReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summary" TEXT NOT NULL,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "queries" TEXT NOT NULL DEFAULT '[]',
    "locations" TEXT NOT NULL DEFAULT '[]',
    "angle" TEXT,
    "searchCursor" INTEGER NOT NULL DEFAULT 0,
    "placesSearchesPerDay" INTEGER NOT NULL DEFAULT 6,
    "webSearchesPerDay" INTEGER NOT NULL DEFAULT 1,
    "checksPerDay" INTEGER NOT NULL DEFAULT 60,
    "newContactsPerDay" INTEGER NOT NULL DEFAULT 100,
    "emailShare" INTEGER NOT NULL DEFAULT 50,
    "minFit" INTEGER NOT NULL DEFAULT 55,
    "followUpDays" TEXT NOT NULL DEFAULT '[3,7]',
    "createdBy" TEXT NOT NULL,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("angle", "checksPerDay", "code", "createdAt", "createdBy", "emailShare", "followUpDays", "goal", "id", "lastRunAt", "locations", "minFit", "name", "newContactsPerDay", "placesSearchesPerDay", "queries", "searchCursor", "segment", "status", "updatedAt", "webSearchesPerDay") SELECT "angle", "checksPerDay", "code", "createdAt", "createdBy", "emailShare", "followUpDays", "goal", "id", "lastRunAt", "locations", "minFit", "name", "newContactsPerDay", "placesSearchesPerDay", "queries", "searchCursor", "segment", "status", "updatedAt", "webSearchesPerDay" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_code_key" ON "Campaign"("code");
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
