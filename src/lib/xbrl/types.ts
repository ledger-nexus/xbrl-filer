// Core types for the pure XBRL pipeline.
//
// Everything in aggregate/instance/validate is a pure function over these
// shapes — no Prisma, no I/O. The orchestrator (generate.ts) is the only
// module that touches the database.

import type { Decimal } from "decimal.js";

export type PeriodType = "INSTANT" | "DURATION";
export type BalanceSide = "DEBIT" | "CREDIT";

export interface ConceptDef {
  /** Namespace-qualified name, e.g. "us-gaap:Assets". */
  qname: string;
  label: string;
  periodType: PeriodType;
  /**
   * XBRL balance attribute. Decides the sign of the aggregation:
   * DEBIT → Σ(debit − credit), CREDIT → Σ(credit − debit) over the
   * mapped accounts. Reporting an expense as a positive number on a
   * debit-balance concept is correct XBRL — consumers render the sign.
   */
  balance: BalanceSide;
}

/** Which account codes roll up into a concept. The judgment artifact. */
export interface MappingDef {
  conceptQname: string;
  accountCodes: string[];
}

/** One posted journal line, reduced to what aggregation needs. */
export interface LedgerLine {
  accountCode: string;
  debit: Decimal;
  credit: Decimal;
  /** The entry's documentDate (drives period windows). */
  documentDate: Date;
}

export interface FactValue {
  qname: string;
  periodType: PeriodType;
  /** Signed per the concept's balance side; exact Decimal. */
  value: Decimal;
  /** accountCode → signed contribution; the tie-out back to the ledger. */
  contributingAccounts: Record<string, string>;
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ValidationReport {
  ok: boolean;
  checks: ValidationCheck[];
  /** Non-fatal observations (e.g. unmapped accounts with balances). */
  warnings: string[];
}

export interface InstanceMeta {
  /** Entity identifier: SEC CIK when present, else the entity code. */
  entityIdentifier: string;
  /** Identifier scheme URI. SEC CIK scheme when cik present. */
  entityScheme: string;
  periodStart: Date;
  periodEnd: Date;
  /** us-gaap namespace for the taxonomy release, used as xmlns. */
  taxonomyNamespace: string;
  /** Published taxonomy entry point for link:schemaRef. */
  schemaRefHref: string;
  /** Namespace prefix for facts (default "us-gaap"). */
  taxonomyPrefix: string;
}
