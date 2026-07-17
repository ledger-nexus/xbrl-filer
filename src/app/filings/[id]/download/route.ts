// Instance-document download. Same auth + tenant scope as the pages:
// no session → 401; a filing outside the session tenant → 404 (existence
// is not leaked across tenants).

import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const tenant = await getCurrentTenant().catch(() => null);
  if (!tenant) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const filing = await prisma.xbrlFiling.findFirst({
    where: { id: params.id, tenantId: tenant.id },
    select: {
      generatedXml: true,
      periodEnd: true,
      bookCode: true,
      entity: { select: { code: true } },
    },
  });
  if (!filing || !filing.generatedXml) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name = `${filing.entity.code}-${filing.bookCode}-${filing.periodEnd
    .toISOString()
    .slice(0, 10)}.xbrl.xml`;

  return new NextResponse(filing.generatedXml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
