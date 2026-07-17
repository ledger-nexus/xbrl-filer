// Fact aggregation — the deterministic heart of the v1 slice.
//
// A concept's value is a pure aggregation over its mapped accounts:
//
//   window : INSTANT  → all lines with documentDate ≤ periodEnd
//            DURATION → lines with periodStart ≤ documentDate ≤ periodEnd
//   sign   : DEBIT  → Σ(debit − credit)
//            CREDIT → Σ(credit − debit)
//
// This one rule covers the whole statement set, including the case a
// pure chart can't otherwise express: Retained Earnings. Northwind has
// no RE account — RE *is* cumulative net income — so the RE concept maps
// to every P&L account code and the INSTANT window turns those mappings
// into life-to-date net income. No special cases in the engine.

import { Decimal } from "decimal.js";
import type { ConceptDef, FactValue, LedgerLine, MappingDef } from "./types";

const ZERO = new Decimal(0);

export function computeFacts(args: {
  lines: LedgerLine[];
  concepts: ConceptDef[];
  mappings: MappingDef[];
  periodStart: Date;
  periodEnd: Date;
}): FactValue[] {
  const conceptByQname = new Map(args.concepts.map((c) => [c.qname, c]));

  // Pre-bucket line sums per account per window so N concepts don't
  // rescan the line list N times.
  const instant = new Map<string, { d: Decimal; c: Decimal }>();
  const duration = new Map<string, { d: Decimal; c: Decimal }>();
  const bump = (
    m: Map<string, { d: Decimal; c: Decimal }>,
    code: string,
    line: LedgerLine
  ) => {
    const cur = m.get(code) ?? { d: ZERO, c: ZERO };
    m.set(code, { d: cur.d.plus(line.debit), c: cur.c.plus(line.credit) });
  };
  for (const line of args.lines) {
    const t = line.documentDate.getTime();
    if (t <= args.periodEnd.getTime()) {
      bump(instant, line.accountCode, line);
      if (t >= args.periodStart.getTime()) bump(duration, line.accountCode, line);
    }
  }

  const facts: FactValue[] = [];
  for (const mapping of args.mappings) {
    const concept = conceptByQname.get(mapping.conceptQname);
    if (!concept) continue; // unknown concept: caller's validator flags it
    const bucket = concept.periodType === "INSTANT" ? instant : duration;

    let total = ZERO;
    const contributing: Record<string, string> = {};
    for (const code of mapping.accountCodes) {
      const sums = bucket.get(code);
      if (!sums) continue;
      const signed =
        concept.balance === "DEBIT" ? sums.d.minus(sums.c) : sums.c.minus(sums.d);
      if (!signed.isZero()) contributing[code] = signed.toFixed(2);
      total = total.plus(signed);
    }

    // Nil facts are omitted from the instance (standard filing practice);
    // an all-zero concept simply doesn't appear.
    if (total.isZero()) continue;

    facts.push({
      qname: concept.qname,
      periodType: concept.periodType,
      value: total,
      contributingAccounts: contributing,
    });
  }

  // Deterministic output order — stable diffs, stable tests.
  facts.sort((a, b) => a.qname.localeCompare(b.qname));
  return facts;
}

/**
 * Accounts that carry activity in the filing window but appear in no
 * mapping. Every one of these is a hole in the statements — surfaced as
 * a validation warning, never silently dropped.
 */
export function unmappedAccounts(args: {
  lines: LedgerLine[];
  mappings: MappingDef[];
  periodEnd: Date;
}): string[] {
  const mapped = new Set(args.mappings.flatMap((m) => m.accountCodes));
  const seen = new Map<string, Decimal>();
  for (const line of args.lines) {
    if (line.documentDate.getTime() > args.periodEnd.getTime()) continue;
    const cur = seen.get(line.accountCode) ?? ZERO;
    seen.set(line.accountCode, cur.plus(line.debit).minus(line.credit));
  }
  return [...seen.entries()]
    .filter(([code, bal]) => !mapped.has(code) && !bal.isZero())
    .map(([code]) => code)
    .sort();
}
