// Integration test for generateFiling against a real Postgres (the shared
// dev DB). Skipped when DATABASE_URL is absent — CI runs pure tests only,
// same posture as recon.
//
// Fixtures are created DIRECTLY via the mirrored models (not through
// ledger-core's postJournalEntry — this repo has no posting path, by
// design). Entries are balanced by construction; the pure validator's
// ledger-ties check would catch any fixture mistake.
//
// Self-healing: a killed prior run leaves XBRLT-prefixed residue that
// poisons reruns — scrub by natural-key prefix in FK order BEFORE seeding
// (portfolio testing rule).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FilingGenerationError, generateFiling } from "../src/lib/xbrl/generate";
import { CONCEPTS, US_GAAP_2024 } from "../src/lib/xbrl/catalog";

const HAS_DB = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();

const ENTITY_CODE = "XBRLT_ENT";
const TENANT_SLUG = "xbrlt-test";
const USER_EMAIL = "xbrlt@test.local";
const BOOK_CODE = "US_GAAP";

let tenantId: string;
let entityId: string;

async function scrub() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (tenant) {
    await prisma.xbrlFiling.deleteMany({ where: { tenantId: tenant.id } }); // facts cascade
    await prisma.xbrlConceptMapping.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.journalLine.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.journalEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.account.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.legalEntity.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
}

describe.skipIf(!HAS_DB)("generateFiling (integration)", () => {
  beforeAll(async () => {
    await scrub();

    const user = await prisma.user.create({
      data: { email: USER_EMAIL, displayName: "XBRL Test" },
    });
    const tenant = await prisma.tenant.create({
      data: { slug: TENANT_SLUG, name: "XBRL Test Tenant", ownerUserId: user.id },
    });
    tenantId = tenant.id;

    const entity = await prisma.legalEntity.create({
      data: {
        tenantId,
        code: ENTITY_CODE,
        name: "XBRL Test Entity",
        functionalCurrencyId: "USD",
      },
    });
    entityId = entity.id;

    const book = await prisma.book.upsert({
      where: { code: BOOK_CODE },
      create: { code: BOOK_CODE, name: "US GAAP", basis: "US_GAAP", reportingCurrencyId: "USD" },
      update: {},
    });

    const accounts = [
      { code: "1000", name: "Cash", type: "ASSET", normalBalance: "DEBIT" },
      { code: "3000", name: "Common Stock", type: "EQUITY", normalBalance: "CREDIT" },
      { code: "4000", name: "Revenue", type: "REVENUE", normalBalance: "CREDIT" },
      { code: "5000", name: "Expense", type: "EXPENSE", normalBalance: "DEBIT" },
    ] as const;
    const accountId = new Map<string, string>();
    for (const a of accounts) {
      const row = await prisma.account.create({
        data: {
          tenantId,
          entityId,
          code: a.code,
          name: a.name,
          type: a.type,
          normalBalance: a.normalBalance,
        },
      });
      accountId.set(a.code, row.id);
    }

    // Balanced entries: capital 10,000 (Jan) · revenue 5,000 (Feb) · expense 2,000 (Mar).
    const entries: Array<{ n: number; date: string; memo: string; lines: [string, number, number][] }> = [
      { n: 1, date: "2026-01-01", memo: "Capital", lines: [["1000", 10000, 0], ["3000", 0, 10000]] },
      { n: 2, date: "2026-02-01", memo: "Revenue", lines: [["1000", 5000, 0], ["4000", 0, 5000]] },
      { n: 3, date: "2026-03-01", memo: "Expense", lines: [["5000", 2000, 0], ["1000", 0, 2000]] },
    ];
    for (const e of entries) {
      await prisma.journalEntry.create({
        data: {
          tenantId,
          entryNumber: `${ENTITY_CODE}-${BOOK_CODE}-${String(e.n).padStart(5, "0")}`,
          entityId,
          bookId: book.id,
          documentDate: new Date(e.date),
          postingDate: new Date(e.date),
          memo: e.memo,
          currencyId: "USD",
          source: "SYSTEM",
          status: "POSTED",
          lines: {
            create: e.lines.map(([code, d, c], i) => ({
              tenantId,
              lineNo: i + 1,
              accountId: accountId.get(code)!,
              debit: d,
              credit: c,
            })),
          },
        },
      });
    }

    // Taxonomy + concepts (same upserts as the seed).
    const taxonomy = await prisma.xbrlTaxonomy.upsert({
      where: {
        namespace_version: { namespace: US_GAAP_2024.namespace, version: US_GAAP_2024.version },
      },
      create: {
        name: US_GAAP_2024.name,
        namespace: US_GAAP_2024.namespace,
        version: US_GAAP_2024.version,
        prefix: US_GAAP_2024.prefix,
        schemaRefHref: US_GAAP_2024.schemaRefHref,
      },
      update: {},
    });
    for (const c of CONCEPTS) {
      await prisma.xbrlConcept.upsert({
        where: { taxonomyId_qname: { taxonomyId: taxonomy.id, qname: c.qname } },
        create: {
          taxonomyId: taxonomy.id,
          qname: c.qname,
          label: c.label,
          periodType: c.periodType,
          balance: c.balance,
        },
        update: {},
      });
    }

    // Mapping for the 4-account chart. Equity/L&SE/RE include P&L codes
    // (cumulative-NI device — see catalog.ts).
    const mapping: Record<string, string[]> = {
      "us-gaap:Assets": ["1000"],
      "us-gaap:CashAndCashEquivalentsAtCarryingValue": ["1000"],
      "us-gaap:StockholdersEquity": ["3000", "4000", "5000"],
      "us-gaap:CommonStockValue": ["3000"],
      "us-gaap:RetainedEarningsAccumulatedDeficit": ["4000", "5000"],
      "us-gaap:LiabilitiesAndStockholdersEquity": ["3000", "4000", "5000"],
      "us-gaap:Revenues": ["4000"],
      "us-gaap:CostsAndExpenses": ["5000"],
      "us-gaap:NetIncomeLoss": ["4000", "5000"],
    };
    const concepts = await prisma.xbrlConcept.findMany({
      where: { taxonomyId: taxonomy.id },
      select: { id: true, qname: true },
    });
    const cid = new Map(concepts.map((c) => [c.qname, c.id]));
    for (const [qname, codes] of Object.entries(mapping)) {
      for (const code of codes) {
        await prisma.xbrlConceptMapping.create({
          data: {
            tenantId,
            entityId,
            taxonomyId: taxonomy.id,
            conceptId: cid.get(qname)!,
            accountCode: code,
            createdBy: "test",
          },
        });
      }
    }
  }, 120_000);

  afterAll(async () => {
    if (HAS_DB) await scrub();
    await prisma.$disconnect();
  });

  it("generates a DRAFT filing whose facts tie to the ledger and pass validation", async () => {
    const { filingId, ok } = await generateFiling(prisma, {
      tenantId,
      entityId,
      bookCode: BOOK_CODE,
      taxonomyVersion: US_GAAP_2024.version,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-03-31"),
    });
    expect(ok).toBe(true);

    const filing = await prisma.xbrlFiling.findUniqueOrThrow({
      where: { id: filingId },
      include: { facts: true },
    });
    expect(filing.status).toBe("DRAFT");

    const value = (qname: string) =>
      Number(filing.facts.find((f) => f.conceptQname === qname)?.value ?? NaN);
    expect(value("us-gaap:Assets")).toBe(13000);
    expect(value("us-gaap:LiabilitiesAndStockholdersEquity")).toBe(13000);
    expect(value("us-gaap:RetainedEarningsAccumulatedDeficit")).toBe(3000);
    expect(value("us-gaap:Revenues")).toBe(5000);
    expect(value("us-gaap:NetIncomeLoss")).toBe(3000);

    const report = filing.validationReport as { ok: boolean; checks: { ok: boolean }[] };
    expect(report.ok).toBe(true);

    expect(filing.generatedXml).toContain(
      `<us-gaap:Assets contextRef="C_I" unitRef="U_USD" decimals="2">13000.00</us-gaap:Assets>`
    );
    expect(filing.generatedXml).toContain(`<xbrli:instant>2026-03-31</xbrli:instant>`);
    // No CIK supplied → entity identified by ledger code under the portfolio scheme.
    expect(filing.generatedXml).toContain(`>XBRLT_ENT</xbrli:identifier>`);
  });

  it("refuses to generate for an entity outside the caller's tenant", async () => {
    const foreign = await prisma.legalEntity.findFirst({
      where: { tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (!foreign) return; // dev DB edge: nothing foreign to test against
    await expect(
      generateFiling(prisma, {
        tenantId,
        entityId: foreign.id,
        bookCode: BOOK_CODE,
        taxonomyVersion: US_GAAP_2024.version,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-03-31"),
      })
    ).rejects.toThrow(FilingGenerationError);
  });

  it("only counts POSTED entries", async () => {
    const book = await prisma.book.findUniqueOrThrow({ where: { code: BOOK_CODE } });
    const cash = await prisma.account.findFirstOrThrow({
      where: { tenantId, code: "1000" },
    });
    const rev = await prisma.account.findFirstOrThrow({
      where: { tenantId, code: "4000" },
    });
    const draft = await prisma.journalEntry.create({
      data: {
        tenantId,
        entryNumber: `${ENTITY_CODE}-${BOOK_CODE}-99999`,
        entityId,
        bookId: book.id,
        documentDate: new Date("2026-02-15"),
        postingDate: new Date("2026-02-15"),
        memo: "Draft — must not count",
        currencyId: "USD",
        source: "SYSTEM",
        status: "DRAFT",
        lines: {
          create: [
            { tenantId, lineNo: 1, accountId: cash.id, debit: 777, credit: 0 },
            { tenantId, lineNo: 2, accountId: rev.id, debit: 0, credit: 777 },
          ],
        },
      },
    });

    const { filingId } = await generateFiling(prisma, {
      tenantId,
      entityId,
      bookCode: BOOK_CODE,
      taxonomyVersion: US_GAAP_2024.version,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-03-31"),
    });
    const filing = await prisma.xbrlFiling.findUniqueOrThrow({
      where: { id: filingId },
      include: { facts: true },
    });
    const assets = Number(
      filing.facts.find((f) => f.conceptQname === "us-gaap:Assets")?.value
    );
    expect(assets).toBe(13000); // unchanged — the DRAFT 777 is invisible

    await prisma.journalEntry.delete({ where: { id: draft.id } });
  });
});
