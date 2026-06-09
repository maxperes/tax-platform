-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleOverride" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalResidenceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "derivedProfile" TEXT NOT NULL,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalResidenceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "contextJson" JSONB,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "structuredPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "incomeType" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "originalCurrency" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "periodicity" TEXT NOT NULL,
    "taxPaidOriginCountry" DECIMAL(18,4),
    "withholdingTax" DECIMAL(18,4),
    "hasProofDocument" BOOLEAN,
    "destinationAccountHint" TEXT,
    "transferredToBrazil" BOOLEAN,
    "remainedAbroad" BOOLEAN,
    "nature" TEXT NOT NULL,
    "notes" TEXT,
    "exchangeRateToBrl" DECIMAL(18,8),
    "grossAmountBrl" DECIMAL(18,4),
    "classification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxableEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountOriginal" DECIMAL(18,4),
    "currency" TEXT,
    "amountBrl" DECIMAL(18,4),
    "occurredOn" DATE NOT NULL,
    "isTaxable" BOOLEAN NOT NULL,
    "incomeSourceId" TEXT,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deduction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "deductionType" TEXT NOT NULL,
    "relatedIncomeId" TEXT,
    "relatedEventId" TEXT,
    "relatedAssetId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,8),
    "amountBrl" DECIMAL(18,4),
    "taxPeriod" TEXT NOT NULL,
    "applicationScope" TEXT NOT NULL,
    "isRecurring" BOOLEAN,
    "isEligible" BOOLEAN,
    "requiresProof" BOOLEAN,
    "proofDocumentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalGainCalculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "assetId" TEXT,
    "taxEventId" TEXT,
    "assetType" TEXT NOT NULL,
    "assetCountry" TEXT NOT NULL,
    "acquisitionDate" DATE NOT NULL,
    "acquisitionValue" DECIMAL(18,4) NOT NULL,
    "acquisitionCurrency" TEXT NOT NULL,
    "saleDate" DATE NOT NULL,
    "saleValue" DECIMAL(18,4) NOT NULL,
    "saleCurrency" TEXT NOT NULL,
    "ownershipPercentageSold" DECIMAL(5,2) NOT NULL,
    "deductibleExpenses" DECIMAL(18,4) NOT NULL,
    "foreignTaxPaid" DECIMAL(18,4),
    "proportionalCost" DECIMAL(18,4),
    "gainAmount" DECIMAL(18,4),
    "taxEstimate" DECIMAL(18,4),
    "ruleVersion" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'BR',
    "dataPackVersion" TEXT,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalGainCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyTaxCalculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "taxMonth" INTEGER NOT NULL,
    "fiscalResidenceStatus" TEXT,
    "totalForeignIncome" DECIMAL(18,4),
    "totalForeignIncomeBrl" DECIMAL(18,4),
    "totalDeductions" DECIMAL(18,4),
    "totalExemptions" DECIMAL(18,4),
    "taxableBase" DECIMAL(18,4) NOT NULL,
    "appliedTaxRate" DECIMAL(8,6) NOT NULL,
    "grossTax" DECIMAL(18,4) NOT NULL,
    "foreignTaxPaid" DECIMAL(18,4),
    "estimatedTaxCredit" DECIMAL(18,4),
    "netTaxDue" DECIMAL(18,4) NOT NULL,
    "calculationStatus" TEXT NOT NULL,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "ruleVersion" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'BR',
    "dataPackVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyTaxCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyTaxCalculationItem" (
    "id" TEXT NOT NULL,
    "monthlyTaxCalculationId" TEXT NOT NULL,
    "incomeSourceId" TEXT,
    "taxEventId" TEXT,
    "incomeType" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "originalCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "amountBrl" DECIMAL(18,4) NOT NULL,
    "foreignTaxPaid" DECIMAL(18,4),
    "deductionAmount" DECIMAL(18,4),
    "exemptionAmount" DECIMAL(18,4),
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "calculatedTax" DECIMAL(18,4) NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyTaxCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCalculation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "calculationType" TEXT NOT NULL,
    "grossIncome" DECIMAL(18,4) NOT NULL,
    "deductionsTotal" DECIMAL(18,4) NOT NULL,
    "exemptionsTotal" DECIMAL(18,4) NOT NULL,
    "taxableBase" DECIMAL(18,4) NOT NULL,
    "appliedRate" DECIMAL(8,6) NOT NULL,
    "grossTax" DECIMAL(18,4) NOT NULL,
    "foreignTaxPaid" DECIMAL(18,4),
    "taxCreditApplied" DECIMAL(18,4),
    "netTaxDue" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "calculationStatus" TEXT NOT NULL,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "ruleVersion" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'BR',
    "dataPackVersion" TEXT,
    "feieApplied" DECIMAL(18,4),
    "ftcApplied" DECIMAL(18,4),
    "niit" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "requiresAdditionalReview" BOOLEAN NOT NULL DEFAULT false,
    "ruleVersion" TEXT NOT NULL,
    "jurisdiction" VARCHAR(16),
    "dataPackVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReportSection" (
    "id" TEXT NOT NULL,
    "taxReportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT,
    "payload" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaxReportSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReportItem" (
    "id" TEXT NOT NULL,
    "taxReportSectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,

    CONSTRAINT "TaxReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RuleOverride_taxYear_idx" ON "RuleOverride"("taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "RuleOverride_jurisdiction_taxYear_key_key" ON "RuleOverride"("jurisdiction", "taxYear", "key");

-- CreateIndex
CREATE INDEX "FiscalResidenceProfile_userId_idx" ON "FiscalResidenceProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalResidenceProfile_userId_taxYear_key" ON "FiscalResidenceProfile"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "ConversationSession_userId_taxYear_idx" ON "ConversationSession"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "ConversationMessage_sessionId_idx" ON "ConversationMessage"("sessionId");

-- CreateIndex
CREATE INDEX "IncomeSource_userId_taxYear_idx" ON "IncomeSource"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "TaxableEvent_userId_taxYear_idx" ON "TaxableEvent"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "Deduction_userId_taxYear_idx" ON "Deduction"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "CapitalGainCalculation_userId_taxYear_idx" ON "CapitalGainCalculation"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "MonthlyTaxCalculation_userId_taxYear_idx" ON "MonthlyTaxCalculation"("userId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyTaxCalculation_userId_taxYear_taxMonth_key" ON "MonthlyTaxCalculation"("userId", "taxYear", "taxMonth");

-- CreateIndex
CREATE INDEX "MonthlyTaxCalculationItem_monthlyTaxCalculationId_idx" ON "MonthlyTaxCalculationItem"("monthlyTaxCalculationId");

-- CreateIndex
CREATE INDEX "TaxCalculation_userId_taxYear_idx" ON "TaxCalculation"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "TaxReport_userId_taxYear_idx" ON "TaxReport"("userId", "taxYear");

-- CreateIndex
CREATE INDEX "TaxReportSection_taxReportId_idx" ON "TaxReportSection"("taxReportId");

-- CreateIndex
CREATE INDEX "TaxReportItem_taxReportSectionId_idx" ON "TaxReportItem"("taxReportSectionId");

-- AddForeignKey
ALTER TABLE "FiscalResidenceProfile" ADD CONSTRAINT "FiscalResidenceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxableEvent" ADD CONSTRAINT "TaxableEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deduction" ADD CONSTRAINT "Deduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalGainCalculation" ADD CONSTRAINT "CapitalGainCalculation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTaxCalculation" ADD CONSTRAINT "MonthlyTaxCalculation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyTaxCalculationItem" ADD CONSTRAINT "MonthlyTaxCalculationItem_monthlyTaxCalculationId_fkey" FOREIGN KEY ("monthlyTaxCalculationId") REFERENCES "MonthlyTaxCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCalculation" ADD CONSTRAINT "TaxCalculation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReport" ADD CONSTRAINT "TaxReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReportSection" ADD CONSTRAINT "TaxReportSection_taxReportId_fkey" FOREIGN KEY ("taxReportId") REFERENCES "TaxReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReportItem" ADD CONSTRAINT "TaxReportItem_taxReportSectionId_fkey" FOREIGN KEY ("taxReportSectionId") REFERENCES "TaxReportSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
