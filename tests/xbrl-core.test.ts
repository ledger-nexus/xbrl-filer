// Pure-core tests: aggregation windows and signs, instance XML shape,
// and the calc validator. No DB, no network — these run in CI.

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { computeFacts, unmappedAccounts } from "../src/lib/xbrl/aggregate";
import { buildInstance } from "../src/lib/xbrl/instance";
import { validateFacts } from "../src/lib/xbrl/validate";
import type { ConceptDef, LedgerLine, MappingDef } from "../src/lib/xbrl/types";

const D = (n: number | string) => new Decimal(n);

const CONCEPTS: ConceptDef[] = [
  { qname: "us-gaap:Assets", label: "Assets", periodType: "INSTANT", balance: "DEBIT" },
  { qname: "us-gaap:Liabilities", label: "Liabilities", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:StockholdersEquity", label: "Equity", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:LiabilitiesAndStockholdersEquity", label: "L+E", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:RetainedEarningsAccumulatedDeficit", label: "RE", periodType: "INSTANT", balance: "CREDIT" },
  { qname: "us-gaap:Revenues", label: "Revenues", periodType: "DURATION", balance: "CREDIT" },
  { qname: "us-gaap:CostsAndExpenses", label: "Costs", periodType: "DURATION", balance: "DEBIT" },
  { qname: "us-gaap:NetIncomeLoss", label: "NI", periodType: "DURATION", balance: "CREDIT" },
];

// Chart: 1000 cash (Dr), 3000 stock (Cr), 4000 revenue (Cr), 5000 expense (Dr).
// Jan: capital 10,000 · Feb: revenue 5,000 · Mar: expense 2,000.
// Filing period = Q1 (Jan 1 – Mar 31).
const LINES: LedgerLine[] = [
  { accountCode: "1000", debit: D(10000), credit: D(0), documentDate: new Date("2026-01-01") },
  { accountCode: "3000", debit: D(0), credit: D(10000), documentDate: new Date("2026-01-01") },
  { accountCode: "1000", debit: D(5000), credit: D(0), documentDate: new Date("2026-02-01") },
  { accountCode: "4000", debit: D(0), credit: D(5000), documentDate: new Date("2026-02-01") },
  { accountCode: "5000", debit: D(2000), credit: D(0), documentDate: new Date("2026-03-01") },
  { accountCode: "1000", debit: D(0), credit: D(2000), documentDate: new Date("2026-03-01") },
];

const PNL = ["4000", "5000"];
const MAPPINGS: MappingDef[] = [
  { conceptQname: "us-gaap:Assets", accountCodes: ["1000"] },
  { conceptQname: "us-gaap:StockholdersEquity", accountCodes: ["3000", ...PNL] },
  { conceptQname: "us-gaap:LiabilitiesAndStockholdersEquity", accountCodes: ["3000", ...PNL] },
  { conceptQname: "us-gaap:RetainedEarningsAccumulatedDeficit", accountCodes: PNL },
  { conceptQname: "us-gaap:Revenues", accountCodes: ["4000"] },
  { conceptQname: "us-gaap:CostsAndExpenses", accountCodes: ["5000"] },
  { conceptQname: "us-gaap:NetIncomeLoss", accountCodes: PNL },
];

const PERIOD = { periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-03-31") };

function factsFor(lines = LINES) {
  return computeFacts({ lines, concepts: CONCEPTS, mappings: MAPPINGS, ...PERIOD });
}

const val = (facts: ReturnType<typeof factsFor>, qname: string) =>
  facts.find((f) => f.qname === qname)?.value.toFixed(2);

describe("computeFacts", () => {
  it("aggregates instant concepts as cumulative balances on the concept's balance side", () => {
    const facts = factsFor();
    expect(val(facts, "us-gaap:Assets")).toBe("13000.00"); // 10000 + 5000 − 2000
    expect(val(facts, "us-gaap:StockholdersEquity")).toBe("13000.00"); // 10000 + NI 3000
  });

  it("derives retained earnings from P&L codes via the instant window (no RE account)", () => {
    expect(val(factsFor(), "us-gaap:RetainedEarningsAccumulatedDeficit")).toBe("3000.00");
  });

  it("aggregates duration concepts over the period window only", () => {
    // Shrink the window to February — only the revenue entry is inside.
    const facts = computeFacts({
      lines: LINES,
      concepts: CONCEPTS,
      mappings: MAPPINGS,
      periodStart: new Date("2026-02-01"),
      periodEnd: new Date("2026-02-28"),
    });
    expect(val(facts, "us-gaap:Revenues")).toBe("5000.00");
    expect(facts.find((f) => f.qname === "us-gaap:CostsAndExpenses")).toBeUndefined(); // zero → omitted
    // Instant concepts still see everything through Feb 28.
    expect(val(facts, "us-gaap:Assets")).toBe("15000.00");
  });

  it("omits nil facts and records per-account contributions", () => {
    const facts = factsFor();
    expect(facts.find((f) => f.qname === "us-gaap:Liabilities")).toBeUndefined();
    const ni = facts.find((f) => f.qname === "us-gaap:NetIncomeLoss")!;
    expect(ni.contributingAccounts).toEqual({ "4000": "5000.00", "5000": "-2000.00" });
  });
});

describe("unmappedAccounts", () => {
  it("flags accounts with balances that appear in no mapping", () => {
    const lines = [
      ...LINES,
      { accountCode: "9999", debit: D(1), credit: D(0), documentDate: new Date("2026-01-15") },
      { accountCode: "3000", debit: D(0), credit: D(1), documentDate: new Date("2026-01-15") },
    ];
    expect(unmappedAccounts({ lines, mappings: MAPPINGS, periodEnd: PERIOD.periodEnd })).toEqual([
      "9999",
    ]);
  });
});

describe("validateFacts", () => {
  it("passes the full identity suite on a balanced, fully-mapped ledger", () => {
    const facts = factsFor();
    const report = validateFacts({ facts, lines: LINES, periodEnd: PERIOD.periodEnd, unmapped: [] });
    expect(report.ok).toBe(true);
    const names = report.checks.map((c) => c.name);
    expect(names).toContain("ledger-ties");
    expect(names).toContain("assets-equal-liabilities-and-equity");
    expect(names).toContain("net-income");
  });

  it("fails A = L+E when the equity mapping drops an account", () => {
    const broken = MAPPINGS.map((m) =>
      m.conceptQname === "us-gaap:LiabilitiesAndStockholdersEquity"
        ? { ...m, accountCodes: ["3000"] } // forgot the P&L codes
        : m
    );
    const facts = computeFacts({ lines: LINES, concepts: CONCEPTS, mappings: broken, ...PERIOD });
    const report = validateFacts({ facts, lines: LINES, periodEnd: PERIOD.periodEnd, unmapped: [] });
    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.name === "assets-equal-liabilities-and-equity")!;
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("≠");
  });

  it("reports unmapped accounts as warnings, not failures", () => {
    const facts = factsFor();
    const report = validateFacts({
      facts,
      lines: LINES,
      periodEnd: PERIOD.periodEnd,
      unmapped: ["9999"],
    });
    expect(report.ok).toBe(true);
    expect(report.warnings[0]).toContain("9999");
  });

  it("fails ledger-ties on an unbalanced line set", () => {
    const lines = [
      ...LINES,
      { accountCode: "1000", debit: D(1), credit: D(0), documentDate: new Date("2026-01-02") },
    ];
    const report = validateFacts({ facts: factsFor(), lines, periodEnd: PERIOD.periodEnd, unmapped: [] });
    expect(report.checks.find((c) => c.name === "ledger-ties")!.ok).toBe(false);
  });
});

describe("buildInstance", () => {
  const META = {
    entityIdentifier: "NORTHWIND",
    entityScheme: "https://ledger-nexus.dev/xbrl/entity-code",
    periodStart: PERIOD.periodStart,
    periodEnd: PERIOD.periodEnd,
    taxonomyNamespace: "http://fasb.org/us-gaap/2024",
    schemaRefHref: "https://xbrl.fasb.org/us-gaap/2024/entire/us-gaap-entryPoint-std-2024.xsd",
    taxonomyPrefix: "us-gaap",
  };

  it("emits a well-shaped XBRL 2.1 instance: contexts, unit, schemaRef, facts", () => {
    const xml = buildInstance(META, factsFor());
    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(`xmlns:us-gaap="http://fasb.org/us-gaap/2024"`);
    expect(xml).toContain(`<link:schemaRef xlink:type="simple"`);
    expect(xml).toContain(`<xbrli:instant>2026-03-31</xbrli:instant>`);
    expect(xml).toContain(`<xbrli:startDate>2026-01-01</xbrli:startDate>`);
    expect(xml).toContain(`<xbrli:measure>iso4217:USD</xbrli:measure>`);
    expect(xml).toContain(
      `<us-gaap:Assets contextRef="C_I" unitRef="U_USD" decimals="2">13000.00</us-gaap:Assets>`
    );
    expect(xml).toContain(
      `<us-gaap:Revenues contextRef="C_D" unitRef="U_USD" decimals="2">5000.00</us-gaap:Revenues>`
    );
  });

  it("escapes XML-significant characters in identifiers", () => {
    const xml = buildInstance({ ...META, entityIdentifier: `A&B <"Co>` }, []);
    expect(xml).toContain("A&amp;B &lt;&quot;Co&gt;");
    expect(xml).not.toContain(`A&B`);
  });

  it("renders negative facts (accumulated deficit) verbatim", () => {
    const facts = computeFacts({
      lines: [
        { accountCode: "5000", debit: D(500), credit: D(0), documentDate: new Date("2026-01-10") },
        { accountCode: "1000", debit: D(0), credit: D(500), documentDate: new Date("2026-01-10") },
      ],
      concepts: CONCEPTS,
      mappings: MAPPINGS,
      ...PERIOD,
    });
    const xml = buildInstance(META, facts);
    expect(xml).toContain(
      `<us-gaap:RetainedEarningsAccumulatedDeficit contextRef="C_I" unitRef="U_USD" decimals="2">-500.00</us-gaap:RetainedEarningsAccumulatedDeficit>`
    );
  });
});
