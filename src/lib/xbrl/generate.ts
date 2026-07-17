// Filing generation orchestrator — the only XBRL module that touches the DB.
//
// Pipeline (v1, per docs/ARCHITECTURE.md):
//   1. Resolve entity (tenant-scoped — a foreign entityId is a hard error)
//   2. Load the taxonomy's concepts + this entity's concept mappings
//   3. Pull POSTED journal lines for (entity, book) through periodEnd
//   4. computeFacts → validateFacts → buildInstance   (pure core)
//   5. Persist Filing + per-fact tie-out rows in one transaction
//
// READ-ONLY on the ledger: step 3 is the only touch of ledger-core data,
// and it is a SELECT. Never posts, never mutates shared tables.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { computeFacts, unmappedAccounts } from "./aggregate";
import { buildInstance, contextRefFor } from "./instance";
import { validateFacts } from "./validate";
import type { ConceptDef, LedgerLine, MappingDef } from "./types";

export interface GenerateFilingInput {
  tenantId: string;
  entityId: string;
  bookCode: string;
  taxonomyVersion: string;
  periodStart: Date;
  periodEnd: Date;
  cik?: string | null;
  documentType?: string | null;
  createdBy?: string | null;
}

export class FilingGenerationError extends Error {}

const SEC_CIK_SCHEME = "http://www.sec.gov/CIK";
// Non-SEC filings identify the entity by its ledger code under a
// portfolio-owned scheme URI (schemes are opaque URIs per XBRL 2.1).
const ENTITY_CODE_SCHEME = "https://ledger-nexus.dev/xbrl/entity-code";

export async function generateFiling(
  prisma: PrismaClient,
  input: GenerateFilingInput
): Promise<{ filingId: string; ok: boolean }> {
  const entity = await prisma.legalEntity.findFirst({
    where: { id: input.entityId, tenantId: input.tenantId },
    select: { id: true, code: true },
  });
  if (!entity) throw new FilingGenerationError("Entity not found in this tenant.");

  const book = await prisma.book.findUnique({
    where: { code: input.bookCode },
    select: { id: true, code: true },
  });
  if (!book) throw new FilingGenerationError(`Unknown book '${input.bookCode}'.`);

  const taxonomy = await prisma.xbrlTaxonomy.findFirst({
    where: { version: input.taxonomyVersion },
    include: { concepts: true },
  });
  if (!taxonomy)
    throw new FilingGenerationError(
      `Taxonomy version '${input.taxonomyVersion}' is not seeded.`
    );

  const mappingRows = await prisma.xbrlConceptMapping.findMany({
    where: {
      tenantId: input.tenantId,
      entityId: entity.id,
      taxonomyId: taxonomy.id,
    },
    include: { concept: { select: { qname: true } } },
  });
  if (mappingRows.length === 0)
    throw new FilingGenerationError(
      "No concept mappings exist for this entity — seed or author a mapping first."
    );

  const concepts: ConceptDef[] = taxonomy.concepts.map((c) => ({
    qname: c.qname,
    label: c.label,
    periodType: c.periodType,
    balance: c.balance,
  }));
  const byQname = new Map<string, string[]>();
  for (const row of mappingRows) {
    const cur = byQname.get(row.concept.qname) ?? [];
    cur.push(row.accountCode);
    byQname.set(row.concept.qname, cur);
  }
  const mappings: MappingDef[] = [...byQname.entries()].map(
    ([conceptQname, accountCodes]) => ({ conceptQname, accountCodes })
  );

  // POSTED lines only — drafts and voids are not financial position.
  const lineRows = await prisma.journalLine.findMany({
    where: {
      tenantId: input.tenantId,
      entry: {
        entityId: entity.id,
        bookId: book.id,
        status: "POSTED",
        documentDate: { lte: input.periodEnd },
      },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { code: true } },
      entry: { select: { documentDate: true } },
    },
  });
  const lines: LedgerLine[] = lineRows.map((l) => ({
    accountCode: l.account.code,
    debit: new Decimal(l.debit.toString()),
    credit: new Decimal(l.credit.toString()),
    documentDate: l.entry.documentDate,
  }));

  const facts = computeFacts({
    lines,
    concepts,
    mappings,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  const unmapped = unmappedAccounts({
    lines,
    mappings,
    periodEnd: input.periodEnd,
  });
  const report = validateFacts({
    facts,
    lines,
    periodEnd: input.periodEnd,
    unmapped,
  });

  const xml = buildInstance(
    {
      entityIdentifier: input.cik?.trim() || entity.code,
      entityScheme: input.cik?.trim() ? SEC_CIK_SCHEME : ENTITY_CODE_SCHEME,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      taxonomyNamespace: taxonomy.namespace,
      schemaRefHref: taxonomy.schemaRefHref,
      taxonomyPrefix: taxonomy.prefix,
    },
    facts
  );

  const filing = await prisma.$transaction(async (tx) => {
    const created = await tx.xbrlFiling.create({
      data: {
        tenantId: input.tenantId,
        entityId: entity.id,
        bookCode: book.code,
        taxonomyId: taxonomy.id,
        status: "DRAFT",
        documentType: input.documentType ?? "FS",
        cik: input.cik?.trim() || null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        generatedXml: xml,
        validationReport: JSON.parse(JSON.stringify(report)),
        generatedAt: new Date(),
        createdBy: input.createdBy ?? null,
      },
    });
    await tx.xbrlFilingFact.createMany({
      data: facts.map((f) => ({
        filingId: created.id,
        conceptQname: f.qname,
        contextRef: contextRefFor(f.periodType),
        value: f.value.toFixed(4),
        contributingAccounts: f.contributingAccounts,
      })),
    });
    return created;
  });

  return { filingId: filing.id, ok: report.ok };
}
