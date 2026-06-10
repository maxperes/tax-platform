-- V1 domain modules: patrimony, transfers, trust, entity simulation, exemptions, data lineage

ALTER TABLE "IncomeSource" ADD COLUMN IF NOT EXISTS "dataOrigin" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Deduction" ADD COLUMN IF NOT EXISTS "dataOrigin" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "CapitalGainCalculation" ADD COLUMN IF NOT EXISTS "dataOrigin" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "TaxReport" ADD COLUMN IF NOT EXISTS "isStale" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "acquisitionDate" DATE NOT NULL,
    "acquisitionValue" DECIMAL(18,4) NOT NULL,
    "acquisitionCurrency" TEXT NOT NULL,
    "currentValue" DECIMAL(18,4),
    "currentCurrency" TEXT,
    "isForeignAsset" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "dataOrigin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InternationalTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "fromCountry" TEXT NOT NULL,
    "toCountry" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "classification" TEXT NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "relatedIncomeId" TEXT,
    "relatedTrustId" TEXT,
    "notes" TEXT,
    "dataOrigin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InternationalTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrustStructure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "trustType" TEXT NOT NULL,
    "settlorName" TEXT,
    "beneficiaryNames" JSONB,
    "isGrantorTrust" BOOLEAN,
    "annualDistributionsUsd" DECIMAL(18,4),
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "dataOrigin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrustStructure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EntitySimulation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "proLaborePercent" DECIMAL(5,2) NOT NULL,
    "profitDistributionPercent" DECIMAL(5,2) NOT NULL,
    "estimatedOperatingCosts" DECIMAL(18,4) NOT NULL,
    "estimatedEffectiveTaxRate" DECIMAL(8,6) NOT NULL,
    "entityCountry" TEXT NOT NULL,
    "pfTaxEstimate" DECIMAL(18,4),
    "pjTaxEstimate" DECIMAL(18,4),
    "savingsEstimate" DECIMAL(18,4),
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersion" TEXT NOT NULL,
    "notes" TEXT,
    "dataOrigin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EntitySimulation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Exemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "exemptionType" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "amountBrl" DECIMAL(18,4),
    "taxPeriod" TEXT NOT NULL,
    "applicationScope" TEXT NOT NULL,
    "notes" TEXT,
    "dataOrigin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Exemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DataChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Asset_userId_taxYear_idx" ON "Asset"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "InternationalTransfer_userId_taxYear_idx" ON "InternationalTransfer"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "TrustStructure_userId_taxYear_idx" ON "TrustStructure"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "EntitySimulation_userId_taxYear_idx" ON "EntitySimulation"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "Exemption_userId_taxYear_idx" ON "Exemption"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "DataChangeLog_userId_taxYear_idx" ON "DataChangeLog"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "DataChangeLog_entityType_entityId_idx" ON "DataChangeLog"("entityType", "entityId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternationalTransfer" ADD CONSTRAINT "InternationalTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustStructure" ADD CONSTRAINT "TrustStructure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitySimulation" ADD CONSTRAINT "EntitySimulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exemption" ADD CONSTRAINT "Exemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataChangeLog" ADD CONSTRAINT "DataChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
