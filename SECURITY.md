# Security posture — xbrl-filer

Same baseline as the portfolio (see ledger-core SECURITY.md / SOC 2 stack).
Repo-specific notes:

- **Tenant isolation:** every owned table carries tenantId; every query and
  Server Action scopes by the session tenant; generateFiling re-verifies the
  entity belongs to the caller's tenant (a foreign entityId is a hard error —
  integration-tested). RLS policies on xbrl_* tables: not yet (parity with
  ledger-core deficiency #12 / Phase 2 — application-level WHERE is the
  active enforcement everywhere in the portfolio).
- **Auth:** Clerk-backed session helpers (recon pattern); middleware fails
  closed in production when Clerk env is missing; write actions fail closed
  always.
- **Audit trail:** filings are immutable-by-convention after DRAFT (v1 only
  creates DRAFT); XbrlFilingFact stores per-fact contributing accounts — the
  tie-out from any reported figure back to ledger lines. No ledger-core
  audit_log writes (this repo mutates no ledger data).
- **Secrets:** DATABASE_URL / Clerk keys from env only; .env gitignored;
  gitleaks + npm audit + CodeQL in CI.
- **Encrypted columns:** ledger-core encrypts some shared columns at rest
  (entity/tenant names, JE memos). xbrl-filer reads NONE of them — entity
  identification uses `code`, aggregation uses amounts/dates/account codes
  only. Instance documents therefore never contain ciphertext or decrypted
  PII.
