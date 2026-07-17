# xbrl-filer

Deterministic XBRL instance generation for the [ledger-nexus](https://github.com/ledger-nexus/ledger-core) portfolio — a **read-only consumer** of the ledger-core substrate. XBRL is reporting, not transacting: this repo never writes a journal entry.

**v1 slice (current):** raw XBRL 2.1 instance documents for a simple IS + BS, against a hand-curated ~35-concept us-gaap subset, with a custom calculation validator (A = L+E, NI = Rev − Costs, ledger tie-out) and a per-fact audit trail back to contributing accounts. No AI, no iXBRL, no dimensions — see `docs/ARCHITECTURE.md` for the v1/v2 split and the full pipeline design.

## Layout

Same companion pattern as `recon` / `revenue-rec`: shared Postgres with ledger-core; this repo mirrors the ledger models it reads and owns the `xbrl_*` tables. Schema changes are applied via a **reviewed `prisma migrate diff` script** (`npm run db:diff`), never a blind `db push` — see the header of `prisma/schema.prisma` for why.

- `src/lib/xbrl/` — the pure core: `aggregate` (facts from lines), `instance` (XML), `validate` (calc identities), `catalog` (concept subset + Northwind mapping), `generate` (DB orchestrator)
- `src/app/filings/*` — list / new / detail (validation report + fact tie-out) / download
- `prisma/seed.ts` — taxonomy + concepts + Northwind demo mapping (idempotent)

## Dev

```bash
npm install && npx prisma generate
set -a; source .env; set +a   # DATABASE_URL = the shared dev DB
npm run db:seed
npm run dev                    # port 3005
npm test                       # pure suite; integration runs when DATABASE_URL is set
```

Auth mirrors recon: Clerk when configured; in production the middleware fails closed without it.
