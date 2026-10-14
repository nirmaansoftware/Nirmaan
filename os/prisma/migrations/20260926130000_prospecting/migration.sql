-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN "prospectId" TEXT;

-- CreateTable
CREATE TABLE "ProspectSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "searchId" TEXT,
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
    CONSTRAINT "Prospect_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
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

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_code_key" ON "Prospect"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_dedupeKey_key" ON "Prospect"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_leadId_key" ON "Prospect"("leadId");

-- CreateIndex
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");

-- CreateIndex
CREATE INDEX "Prospect_fitScore_idx" ON "Prospect"("fitScore");

-- CreateIndex
CREATE INDEX "Prospect_domain_idx" ON "Prospect"("domain");

-- CreateIndex
CREATE INDEX "Prospect_nameKey_idx" ON "Prospect"("nameKey");

-- CreateIndex
CREATE INDEX "Prospect_placeId_idx" ON "Prospect"("placeId");

-- CreateIndex
CREATE INDEX "OutreachMessage_status_sentAt_idx" ON "OutreachMessage"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_value_key" ON "Suppression"("value");
