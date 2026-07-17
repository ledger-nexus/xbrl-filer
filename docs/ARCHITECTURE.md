# xbrl-filer — architecture

Preserved from the 2026-05-22 design (deferred then; revived 2026-07-16 on
the owner's call). This file is the durable home of that sketch; the memory
note that carried it now points here.

## Where it lives

Companion repo following the recon/revenue-rec template. **Read-only
consumer of ledger-core** — shares the Postgres database, mirrors the ledger
models it queries, owns the `xbrl_*` tables. Does NOT write to the
substrate: XBRL is reporting, not transacting.

## Owned tables

- `xbrl_taxonomy` — URI, namespace, version (v1 seeds a hand-curated
  us-gaap subset; full taxonomy ingestion is v2)
- `xbrl_concept` — denormalized concept catalog: qname, periodType
  (instant/duration), balance (debit/credit), label
- `xbrl_concept_mapping` — per-(tenant, entity, taxonomy): which account
  codes roll up into which concept. **The judgment-laden artifact**; changes
  per taxonomy version.
- `xbrl_filing` — one row per filing. Status DRAFT → REVIEWED → FILED →
  AMENDED (v1 creates DRAFT only). Stores generatedXml + validationReport;
  DEI fields (CIK, documentType) live here — no ledger-core schema change
  needed for v1.
- `xbrl_filing_fact` — per-fact audit trail: concept, context, exact value,
  contributing accounts with signed amounts. The tie-out from instance
  document back to journal lines.
- `ai_mapping_suggestion` — designed, deliberately unbuilt in v1.

## Pipeline (v1)

1. User creates a filing for (entity, book, periodStart–periodEnd)
2. Orchestrator pulls POSTED journal lines through periodEnd (the only
   ledger touch — a SELECT)
3. Pure core computes facts: concept value = signed sum over mapped
   accounts; INSTANT = cumulative ≤ periodEnd, DURATION = within the period;
   sign from the concept's balance attribute
4. Custom calc validator runs on exact Decimals: ledger tie-out,
   A = L+E, L+E decomposition, NI = Rev − CostsAndExpenses, GP = Rev − CoR;
   unmapped accounts with balances become warnings
5. Instance XML (raw XBRL 2.1: two contexts, USD unit, decimals="2")
   assembled and persisted with the report + per-fact tie-out rows

### The retained-earnings device

Charts without an RE account (Northwind, and any ledger that computes RE
from cumulative P&L) map the RetainedEarnings concept to **all P&L account
codes** — the INSTANT window turns those mappings into life-to-date net
income. StockholdersEquity and LiabilitiesAndStockholdersEquity include the
P&L codes for the same reason, which makes "A = L+E" in the validator
mathematically identical to the trial balance tying. No special case in the
engine.

## v1 vs v2

| | v1 (this repo, now) | v2 (future) |
|---|---|---|
| Format | raw XBRL 2.1 XML | iXBRL embedded in HTML |
| Taxonomy | ~35 hand-curated us-gaap concepts | full ingestion (~17K), version diffing |
| Validation | custom calc identities | Arelle integration, schema validation |
| Dimensions | none | segment dimensions |
| Restatements | refuse (manual workflow) | RestatementAxis + cumulative-effect |
| AI | none | mapping suggestions + drafted disclosures, human-approved, never signs |
| Audience | internal / FERC-FDIC-EBA-shaped raw XBRL | SEC filers (10-K/10-Q) |

## Gnarly parts (called out before they bite)

1. iXBRL HTML templating ≈ half the v2 work (a 10-K is 100+ pages with
   thousands of `<ix:nonFraction>` tags)
2. Calculation linkbase at scale — v1's identity set is the seed of it
3. Concept mapping at ~17K concepts — AI proposes, humans review each once
4. Period-type matching — enforced by construction here (context chosen
   from the concept's declared periodType)
5. Sign conventions — balance-attribute-driven signing is implemented and
   tested (expenses positive on debit concepts; deficits negative)
6. Restatements — v1 refuses; v2 designs

## Schema-safety protocol (learned on day one)

The first `prisma migrate diff` from the shared dev DB to this repo's
schema produced **284 statements — 263 of them ALTER/DROP against other
repos' tables** (the inevitable result of any companion mirroring a subset
of a shared database). Therefore:

- `db push` is banned in this repo (no npm script exists for it)
- changes apply via `npm run db:diff` → keep ONLY `xbrl_*` statements
  (`prisma/apply-xbrl-only.sql` pattern) → `prisma db execute`
- the mirror is re-generated from ledger-core's current schema, never
  hand-edited — and the filtered-apply protocol makes even a stale mirror
  unable to damage shared tables
