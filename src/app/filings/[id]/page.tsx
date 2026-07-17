// Filing detail: validation report + fact tie-out + download.
//
// The fact table shows, for every reported figure, exactly which ledger
// accounts contributed what — the audit trail from instance document back
// to journal lines. This page is why FilingFact exists.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export default async function FilingDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getCurrentTenant().catch(() => null);
  if (!tenant) {
    return (
      <EmptyState
        title="Sign in to view filings"
        description="Filings are tenant-scoped; this page requires an authenticated session."
      />
    );
  }

  const filing = await prisma.xbrlFiling.findFirst({
    where: { id: params.id, tenantId: tenant.id },
    include: {
      entity: { select: { code: true } },
      taxonomy: { select: { version: true, namespace: true } },
      facts: { orderBy: { conceptQname: "asc" } },
    },
  });
  if (!filing) return notFound();

  const report = (filing.validationReport ?? { ok: false, checks: [], warnings: [] }) as unknown as {
    ok: boolean;
    checks: Check[];
    warnings: string[];
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>
              {filing.entity.code} / {filing.bookCode} — {filing.documentType ?? "FS"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone={report.ok ? "positive" : "negative"}>
                {report.ok ? "Validation passed" : "Validation FAILED"}
              </Badge>
              <Badge tone="neutral">{filing.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-ink-700">
            Period {filing.periodStart.toISOString().slice(0, 10)} →{" "}
            {filing.periodEnd.toISOString().slice(0, 10)} · us-gaap {filing.taxonomy.version}
            {filing.cik ? ` · CIK ${filing.cik}` : ""}
          </p>
          <div>
            <Link
              href={`/filings/${filing.id}/download`}
              className="inline-flex items-center rounded-md border border-ink-900 bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-700"
            >
              Download instance (.xml)
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {report.checks.map((c) => (
            <p key={c.name} className="text-sm">
              <Badge tone={c.ok ? "positive" : "negative"}>{c.ok ? "PASS" : "FAIL"}</Badge>{" "}
              <span className="text-ink-700">{c.detail}</span>
            </p>
          ))}
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">
              ⚠ {w}
            </p>
          ))}
          {report.checks.length === 0 && (
            <p className="text-sm text-ink-500">No validation report recorded.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facts ({filing.facts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Concept</TH>
                <TH>Context</TH>
                <TH className="text-right">Value</TH>
                <TH>Contributing accounts</TH>
              </TR>
            </THead>
            <TBody>
              {filing.facts.map((f) => (
                <TR key={f.id}>
                  <TD className="font-mono text-xs">{f.conceptQname}</TD>
                  <TD>{f.contextRef === "C_I" ? "instant" : "duration"}</TD>
                  <TD className="text-right tabular-nums">{Number(f.value).toFixed(2)}</TD>
                  <TD className="font-mono text-xs text-ink-500">
                    {Object.entries((f.contributingAccounts ?? {}) as Record<string, string>)
                      .map(([code, amt]) => `${code}: ${amt}`)
                      .join(" · ")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
