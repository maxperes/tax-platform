-- Tax Residency Impact Assessment: plans, twin, documents, assessments

CREATE TYPE "UserPlan" AS ENUM ('basic', 'pro');

ALTER TABLE "User" ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'basic';

CREATE TABLE "TwinCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Family Tax Twin',
    "inventoryJson" JSONB NOT NULL,
    "asIsCompletion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwinCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TwinPerson" (
    "id" TEXT NOT NULL,
    "twinCaseId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "livesInCountry" TEXT,
    "worksInCountry" TEXT,
    "hasIncome" BOOLEAN,
    "hasWealth" BOOLEAN,
    "hasInvestments" BOOLEAN,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwinPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinCaseId" TEXT,
    "taxYear" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "extractedFactsJson" JSONB,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImpactAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinCaseId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "hypothesisResidencyDate" DATE NOT NULL,
    "applyReliefs" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "asIsJson" JSONB NOT NULL,
    "toBeJson" JSONB NOT NULL,
    "planningJson" JSONB,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "ruleVersion" TEXT NOT NULL,
    "legalRulePackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TwinCase_userId_taxYear_key" ON "TwinCase"("userId", "taxYear");
CREATE INDEX "TwinCase_userId_taxYear_idx" ON "TwinCase"("userId", "taxYear");
CREATE INDEX "TwinPerson_twinCaseId_idx" ON "TwinPerson"("twinCaseId");
CREATE INDEX "Document_userId_taxYear_idx" ON "Document"("userId", "taxYear");
CREATE INDEX "Document_twinCaseId_idx" ON "Document"("twinCaseId");
CREATE INDEX "ImpactAssessment_userId_taxYear_idx" ON "ImpactAssessment"("userId", "taxYear");
CREATE INDEX "ImpactAssessment_twinCaseId_idx" ON "ImpactAssessment"("twinCaseId");

ALTER TABLE "TwinCase" ADD CONSTRAINT "TwinCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwinPerson" ADD CONSTRAINT "TwinPerson_twinCaseId_fkey" FOREIGN KEY ("twinCaseId") REFERENCES "TwinCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_twinCaseId_fkey" FOREIGN KEY ("twinCaseId") REFERENCES "TwinCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImpactAssessment" ADD CONSTRAINT "ImpactAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImpactAssessment" ADD CONSTRAINT "ImpactAssessment_twinCaseId_fkey" FOREIGN KEY ("twinCaseId") REFERENCES "TwinCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
