CREATE TYPE "XbrlPeriodType" AS ENUM ('INSTANT', 'DURATION');

CREATE TYPE "XbrlBalance" AS ENUM ('DEBIT', 'CREDIT');

CREATE TYPE "XbrlFilingStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FILED', 'AMENDED');

CREATE TABLE "xbrl_taxonomy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schemaRefHref" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'us-gaap',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xbrl_taxonomy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xbrl_concept" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taxonomyId" UUID NOT NULL,
    "qname" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodType" "XbrlPeriodType" NOT NULL,
    "balance" "XbrlBalance" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xbrl_concept_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xbrl_concept_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "taxonomyId" UUID NOT NULL,
    "conceptId" UUID NOT NULL,
    "accountCode" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xbrl_concept_mapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xbrl_filing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "bookCode" TEXT NOT NULL,
    "taxonomyId" UUID NOT NULL,
    "status" "XbrlFilingStatus" NOT NULL DEFAULT 'DRAFT',
    "documentType" TEXT,
    "cik" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedXml" TEXT,
    "validationReport" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xbrl_filing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xbrl_filing_fact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filingId" UUID NOT NULL,
    "conceptQname" TEXT NOT NULL,
    "contextRef" TEXT NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "contributingAccounts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xbrl_filing_fact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xbrl_taxonomy_namespace_version_key" ON "xbrl_taxonomy"("namespace", "version");

CREATE UNIQUE INDEX "xbrl_concept_taxonomyId_qname_key" ON "xbrl_concept"("taxonomyId", "qname");

CREATE INDEX "xbrl_concept_mapping_tenantId_entityId_taxonomyId_idx" ON "xbrl_concept_mapping"("tenantId", "entityId", "taxonomyId");

CREATE UNIQUE INDEX "xbrl_concept_mapping_tenantId_entityId_taxonomyId_conceptId_key" ON "xbrl_concept_mapping"("tenantId", "entityId", "taxonomyId", "conceptId", "accountCode");

CREATE INDEX "xbrl_filing_tenantId_entityId_idx" ON "xbrl_filing"("tenantId", "entityId");

CREATE INDEX "xbrl_filing_fact_filingId_idx" ON "xbrl_filing_fact"("filingId");

ALTER TABLE "xbrl_concept" ADD CONSTRAINT "xbrl_concept_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_concept_mapping" ADD CONSTRAINT "xbrl_concept_mapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_concept_mapping" ADD CONSTRAINT "xbrl_concept_mapping_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_concept_mapping" ADD CONSTRAINT "xbrl_concept_mapping_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "xbrl_concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_filing" ADD CONSTRAINT "xbrl_filing_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_filing" ADD CONSTRAINT "xbrl_filing_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "xbrl_taxonomy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "xbrl_filing_fact" ADD CONSTRAINT "xbrl_filing_fact_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "xbrl_filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
