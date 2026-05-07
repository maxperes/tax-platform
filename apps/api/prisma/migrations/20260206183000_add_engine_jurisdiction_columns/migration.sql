-- BR/US engine columns: safe to re-run on older dev DBs (PostgreSQL 11+ IF NOT EXISTS on ADD COLUMN).

ALTER TABLE "MonthlyTaxCalculation" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'BR';
ALTER TABLE "MonthlyTaxCalculation" ADD COLUMN IF NOT EXISTS "dataPackVersion" TEXT;

ALTER TABLE "CapitalGainCalculation" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'BR';
ALTER TABLE "CapitalGainCalculation" ADD COLUMN IF NOT EXISTS "dataPackVersion" TEXT;

ALTER TABLE "TaxCalculation" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'BR';
ALTER TABLE "TaxCalculation" ADD COLUMN IF NOT EXISTS "dataPackVersion" TEXT;
ALTER TABLE "TaxCalculation" ADD COLUMN IF NOT EXISTS "feieApplied" DECIMAL(18, 4);
ALTER TABLE "TaxCalculation" ADD COLUMN IF NOT EXISTS "ftcApplied" DECIMAL(18, 4);
ALTER TABLE "TaxCalculation" ADD COLUMN IF NOT EXISTS "niit" DECIMAL(18, 4);

ALTER TABLE "TaxReport" ADD COLUMN IF NOT EXISTS "jurisdiction" VARCHAR(16);
ALTER TABLE "TaxReport" ADD COLUMN IF NOT EXISTS "dataPackVersion" TEXT;
