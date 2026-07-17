// Filing list — tenant-scoped. Unauthenticated sessions see the sign-in
// nudge rather than data (getCurrentTenant is null without Clerk).

import Link from "next/link";
import { getCurrentTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "neutral",
  REVIEWED: "info",
  FILED: "positive",
  AMENDED: "warning",
} as const;

export default async function FilingsPage() {
  const tenant = await getCurrentTenant().catch(() => null);
  if (!tenant) {
    return (
      <EmptyState
        title="Sign in to see filings"
        description="Filings are tenant-scoped; this instance requires an authenticated session (Clerk) for any data access."
      />
    );
  }

  const filings = await prisma.xbrlFiling.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      documentType: true,
      bookCode: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
      entity: { select: { code: true } },
    },
  });

  if (filings.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState
          title="No filings yet"
          description="Generate the first XBRL instance document from the ledger."
        />
        <Link
          href="/filings/new"
          className="rounded-md border border-ink-900 bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-700"
        >
          New filing
        </Link>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filings</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Entity</TH>
              <TH>Book</TH>
              <TH>Type</TH>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {filings.map((f) => (
              <TR key={f.id}>
                <TD>
                  <Link href={`/filings/${f.id}`} className="font-medium text-ink-900 hover:underline">
                    {f.entity.code}
                  </Link>
                </TD>
                <TD>{f.bookCode}</TD>
                <TD>{f.documentType ?? "FS"}</TD>
                <TD>
                  {f.periodStart.toISOString().slice(0, 10)} → {f.periodEnd.toISOString().slice(0, 10)}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[f.status]}>{f.status}</Badge>
                </TD>
                <TD>{f.createdAt.toISOString().slice(0, 10)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
