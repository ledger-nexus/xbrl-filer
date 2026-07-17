# AGENTS.md — xbrl-filer

Instructions for AI coding/review agents (Codex, etc.). The **reviewer's contract**: what to check, what is *intentional and must NOT be flagged*. Canonical: [`CLAUDE.md`](CLAUDE.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md).

## What this is

`xbrl-filer` is the XBRL instance-generation companion — a **read-only consumer** of the ledger-core substrate. It turns POSTED ledger activity into raw XBRL 2.1 instance documents, validates them arithmetically, and stores a per-fact tie-out back to contributing accounts. XBRL is reporting, not transacting.

## Review THESE first

- **Read-only on the ledger is the core invariant.** No code path may write a journal entry or any ledger-core-owned table. The single ledger touch (`src/lib/xbrl/generate.ts`) is one SELECT of POSTED lines. Any INSERT/UPDATE against a ledger-core-owned table is a defect.
- **Validation before persistence.** A filing is saved with its validation report; the calc identities (ledger tie-out, A = L+E, L+E decomposition, NI = Rev − CostsAndExpenses, GP = Rev − CoR) run on exact `Decimal` values *before* any XML is written. A path that persists a filing without validating, or validates with `Number` instead of `Decimal`, is a defect.
- **Tenant scoping.** Server Action + download route resolve the session tenant; `generateFiling` re-verifies the entity belongs to the caller's tenant (a foreign `entityId` is a hard error — tested). Filing download must not leak cross-tenant existence.
- **Sign convention.** Fact signs come from each concept's declared XBRL `balance` attribute (DEBIT → Σ(debit−credit), CREDIT → Σ(credit−debit)). A hardcoded sign, or ignoring the balance attribute, is a defect.

## Intentional — do NOT report these as defects

- **The `prisma/schema.prisma` ledger-core mirror is GENERATED, FK-closed, not accidental duplication.** Don't suggest importing from ledger-core or de-duplicating.
- **`prisma db push` is BANNED** — the first migrate-diff against the shared DB produced 284 statements, 263 destructive to other repos' tables. xbrl-owned schema changes go through the filtered reviewed-diff (`prisma/apply-xbrl-only.sql` pattern) + `prisma db execute`. Don't recommend `db push` / `migrate dev`.
- **The RetainedEarnings concept maps to ALL P&L account codes** (this chart has no RE account; RE = cumulative net income, and the INSTANT window makes that life-to-date NI). This is the deliberate device that makes "A = L+E" identical to the trial balance tying — not a mapping error.
- **v1 emits raw XBRL 2.1, NOT iXBRL; ~35 hand-curated us-gaap concepts, no dimensions, no taxonomy-schema (Arelle) validation, no AI mapping suggestions.** These are the documented v2 scope, not gaps/omissions to flag. See `docs/ARCHITECTURE.md` for the v1/v2 split.
- **Nil facts are omitted from the instance** (standard filing practice) — an all-zero concept simply doesn't appear; not a dropped value.

## Security lens (SOC 2)

Portfolio baseline; auth mirrors recon (Clerk session helpers; middleware fails closed in prod without Clerk). This repo reads no encrypted shared columns — entities are identified by `code`, so instance documents never contain ciphertext or decrypted PII.
