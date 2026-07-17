# Claude Code Instructions for xbrl-filer

Companion repo of the ledger-nexus portfolio (ledger-core substrate + recon,
revenue-rec, fa-amort, integrations, xbrl-filer). Read ledger-core's
CLAUDE.md and `docs/universal-schema.md` first — its non-negotiables apply
here, plus these repo-specific ones:

## Non-negotiables

1. **Read-only on the ledger.** xbrl-filer NEVER writes ledger-core tables —
   no journal entries, no accounts, nothing. XBRL is reporting, not
   transacting. Its writes are confined to `xbrl_*` tables.
2. **Never `prisma db push` from this repo.** The schema mirrors ledger-core
   models; a push would try to ALTER/DROP shared tables (proven: the first
   migrate-diff against the dev DB produced 284 statements, 263 of them
   destructive to other repos' tables). Schema changes go through
   `npm run db:diff` → review the script → keep ONLY `xbrl_*` statements →
   `prisma db execute`. The applied script is committed under `prisma/`.
3. **The mirror is generated, not hand-edited.** When ledger-core's schema
   changes, re-extract the mirrored models from its current schema.prisma
   (see the mirror header). Hand-drift = destructive diffs.
4. **Facts are pure aggregations.** Concept value = signed sum over mapped
   accounts in the period window (see `src/lib/xbrl/aggregate.ts`). No
   special cases in the engine; judgment lives in ConceptMapping rows.
5. **Validation before persistence.** A filing is saved with its validation
   report; identities (A = L+E, NI = Rev − Costs, ledger tie-out) run on
   exact Decimals before any XML is written.
6. **No AI in v1.** AiMappingSuggestion (mapping proposals, drafted
   disclosures) is designed but deliberately unbuilt — when it lands it
   follows the portfolio pattern: AI suggests, humans approve, and AI never
   signs a filing.

## Working rules

- decimal.js for all amounts; compare with `.equals()`, never `===`.
- Tests: pure suite must run with no DB (CI); DB suites self-skip without
  DATABASE_URL and self-heal their fixtures (scrub by prefix in beforeAll).
- Server Actions: requireCurrentUser + requireCurrentTenant, tenant-scope
  every lookup (recon's session pattern, same file).
- Port 3005. Money displays via toFixed(2); XML decimals="2".
