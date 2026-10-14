-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "JobState" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "lockedUntil" DATETIME,
    "lastRunAt" DATETIME,
    "data" TEXT NOT NULL DEFAULT '{}'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutreachMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "step" INTEGER NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "scheduledFor" DATETIME,
    "messageRef" TEXT,
    "threadRef" TEXT,
    "draftedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "sentVia" TEXT,
    "sentAt" DATETIME,
    "sendError" TEXT,
    "providerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutreachMessage_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OutreachMessage" ("approvedBy", "body", "channel", "createdAt", "draftedBy", "id", "prospectId", "providerId", "sendError", "sentAt", "sentVia", "status", "subject", "toAddress", "updatedAt") SELECT "approvedBy", "body", "channel", "createdAt", "draftedBy", "id", "prospectId", "providerId", "sendError", "sentAt", "sentVia", "status", "subject", "toAddress", "updatedAt" FROM "OutreachMessage";
DROP TABLE "OutreachMessage";
ALTER TABLE "new_OutreachMessage" RENAME TO "OutreachMessage";
CREATE INDEX "OutreachMessage_status_sentAt_idx" ON "OutreachMessage"("status", "sentAt");
CREATE INDEX "OutreachMessage_status_scheduledFor_idx" ON "OutreachMessage"("status", "scheduledFor");
CREATE INDEX "OutreachMessage_campaignId_channel_createdAt_idx" ON "OutreachMessage"("campaignId", "channel", "createdAt");
CREATE TABLE "new_Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "searchId" TEXT,
    "campaignId" TEXT,
    "repliedAt" DATETIME,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "domain" TEXT,
    "nameKey" TEXT NOT NULL,
    "placeId" TEXT,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "city" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "emailSource" TEXT,
    "rating" REAL,
    "ratingCount" INTEGER,
    "mapsUrl" TEXT,
    "sourceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "siteSignals" TEXT,
    "auditedAt" DATETIME,
    "fitScore" INTEGER,
    "suggestedPackage" TEXT,
    "problem" TEXT,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "dismissedReason" TEXT,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prospect_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "ProspectSearch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Prospect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Prospect_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Prospect" ("address", "auditedAt", "category", "city", "code", "createdAt", "dedupeKey", "dismissedReason", "domain", "email", "emailSource", "evidence", "fitScore", "id", "leadId", "mapsUrl", "name", "nameKey", "phone", "placeId", "problem", "rating", "ratingCount", "searchId", "segment", "siteSignals", "source", "sourceNote", "status", "suggestedPackage", "updatedAt", "website") SELECT "address", "auditedAt", "category", "city", "code", "createdAt", "dedupeKey", "dismissedReason", "domain", "email", "emailSource", "evidence", "fitScore", "id", "leadId", "mapsUrl", "name", "nameKey", "phone", "placeId", "problem", "rating", "ratingCount", "searchId", "segment", "siteSignals", "source", "sourceNote", "status", "suggestedPackage", "updatedAt", "website" FROM "Prospect";
DROP TABLE "Prospect";
ALTER TABLE "new_Prospect" RENAME TO "Prospect";
CREATE UNIQUE INDEX "Prospect_code_key" ON "Prospect"("code");
CREATE UNIQUE INDEX "Prospect_dedupeKey_key" ON "Prospect"("dedupeKey");
CREATE UNIQUE INDEX "Prospect_leadId_key" ON "Prospect"("leadId");
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");
CREATE INDEX "Prospect_fitScore_idx" ON "Prospect"("fitScore");
CREATE INDEX "Prospect_campaignId_status_idx" ON "Prospect"("campaignId", "status");
CREATE INDEX "Prospect_domain_idx" ON "Prospect"("domain");
CREATE INDEX "Prospect_nameKey_idx" ON "Prospect"("nameKey");
CREATE INDEX "Prospect_placeId_idx" ON "Prospect"("placeId");
CREATE TABLE "new_ProspectSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "campaignId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectSearch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProspectSearch" ("added", "createdAt", "createdBy", "found", "id", "location", "notes", "query", "segment", "sources") SELECT "added", "createdAt", "createdBy", "found", "id", "location", "notes", "query", "segment", "sources" FROM "ProspectSearch";
DROP TABLE "ProspectSearch";
ALTER TABLE "new_ProspectSearch" RENAME TO "ProspectSearch";
CREATE INDEX "ProspectSearch_campaignId_createdAt_idx" ON "ProspectSearch"("campaignId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_code_key" ON "Campaign"("code");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");
