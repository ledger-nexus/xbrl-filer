// Calculation validation — the custom v1 validator the sketch called for.
//
// Not a taxonomy-schema validator (that's v2/Arelle). These are the
// arithmetic identities an auditor checks first, asserted against the
// exact Decimal fact values BEFORE the XML is written:
//
//   1. The ledger itself ties (Σ debits = Σ credits through periodEnd) —
//      if this fails nothing downstream is meaningful.
//   2. Assets = LiabilitiesAndStockholdersEquity
//   3. LiabilitiesAndStockholdersEquity = Liabilities + StockholdersEquity
//   4. NetIncomeLoss = Revenues − CostsAndExpenses
//   5. GrossProfit = Revenues − CostOfRevenue
//
// Identities 2–5 run only when every participating concept has a fact —
// a partial mapping legitimately produces a partial statement, and the
// unmapped-accounts warning (not a hard failure) is what says so.

import { Decimal } from "decimal.js";
import type { FactValue, LedgerLine, ValidationCheck, ValidationReport } from "./types";

const ZERO = new Decimal(0);

function factMap(facts: FactValue[]): Map<string, Decimal> {
  return new Map(facts.map((f) => [f.qname, f.value]));
}

function identity(
  name: string,
  left: Decimal | undefined,
  right: Decimal | undefined,
  describe: string
): ValidationCheck | null {
  if (left === undefined || right === undefined) return null; // not all facts present
  const ok = left.equals(right);
  return {
    name,
    ok,
    detail: ok
      ? `${describe}: ${left.toFixed(2)} = ${right.toFixed(2)} ✓`
      : `${describe}: ${left.toFixed(2)} ≠ ${right.toFixed(2)} (off by ${left.minus(right).toFixed(2)})`,
  };
}

export function validateFacts(args: {
  facts: FactValue[];
  lines: LedgerLine[];
  periodEnd: Date;
  unmapped: string[];
}): ValidationReport {
  const checks: ValidationCheck[] = [];
  const f = factMap(args.facts);
  const get = (local: string) => f.get(`us-gaap:${local}`);

  // 1. Ledger tie-out through periodEnd.
  let d = ZERO;
  let c = ZERO;
  for (const line of args.lines) {
    if (line.documentDate.getTime() > args.periodEnd.getTime()) continue;
    d = d.plus(line.debit);
    c = c.plus(line.credit);
  }
  checks.push({
    name: "ledger-ties",
    ok: d.equals(c),
    detail: d.equals(c)
      ? `Σ debits = Σ credits = ${d.toFixed(2)} ✓`
      : `Σ debits ${d.toFixed(2)} ≠ Σ credits ${c.toFixed(2)}`,
  });

  // 2–5. Statement identities (only when all participants are present).
  const maybe = [
    identity(
      "assets-equal-liabilities-and-equity",
      get("Assets"),
      get("LiabilitiesAndStockholdersEquity"),
      "A = L+E"
    ),
    identity(
      "liabilities-plus-equity",
      get("LiabilitiesAndStockholdersEquity"),
      get("Liabilities")?.plus(get("StockholdersEquity") ?? ZERO),
      "L+E decomposition"
    ),
    identity(
      "net-income",
      get("NetIncomeLoss"),
      get("Revenues")?.minus(get("CostsAndExpenses") ?? ZERO),
      "NI = Rev − CostsAndExpenses"
    ),
    identity(
      "gross-profit",
      get("GrossProfit"),
      get("Revenues")?.minus(get("CostOfRevenue") ?? ZERO),
      "GP = Rev − CoR"
    ),
  ];
  for (const check of maybe) if (check) checks.push(check);

  const warnings = args.unmapped.map(
    (code) =>
      `Account ${code} has a balance in the filing window but is mapped to no concept — its amount is missing from the statements.`
  );

  return { ok: checks.every((ch) => ch.ok), checks, warnings };
}
