// New-filing form. Entities offered are the session tenant's only; the
// action re-verifies the posted entityId against the tenant regardless
// (never trust the dropdown).

import { getCurrentTenant } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createFilingAction } from "@/app/actions/filings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function NewFilingPage() {
  const tenant = await getCurrentTenant().catch(() => null);
  if (!tenant) {
    return (
      <EmptyState
        title="Sign in to create a filing"
        description="Filing generation requires an authenticated session."
      />
    );
  }

  const [entities, books, taxonomies] = await Promise.all([
    prisma.legalEntity.findMany({
      where: { tenantId: tenant.id },
      orderBy: { code: "asc" },
      select: { id: true, code: true },
    }),
    prisma.book.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.xbrlTaxonomy.findMany({
      orderBy: { version: "desc" },
      select: { version: true, name: true },
    }),
  ]);

  if (taxonomies.length === 0) {
    return (
      <EmptyState
        title="No taxonomy seeded"
        description="Run the seed (npm run db:seed) to load the us-gaap concept subset first."
      />
    );
  }

  async function act(formData: FormData) {
    "use server";
    await createFilingAction(formData);
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>New filing</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={act} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="entityId">Entity</Label>
              <Select id="entityId" name="entityId" required>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="bookCode">Book</Label>
              <Select id="bookCode" name="bookCode" required defaultValue="US_GAAP">
                {books.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="periodStart">Period start</Label>
              <Input id="periodStart" name="periodStart" type="date" required />
            </div>
            <div>
              <Label htmlFor="periodEnd">Period end</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="taxonomyVersion">Taxonomy</Label>
              <Select id="taxonomyVersion" name="taxonomyVersion" required>
                {taxonomies.map((t) => (
                  <option key={t.version} value={t.version}>
                    us-gaap {t.version}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="cik">SEC CIK (optional)</Label>
              <Input id="cik" name="cik" placeholder="entity code used if blank" />
            </div>
          </div>
          <input type="hidden" name="documentType" value="FS" />
          <p className="text-xs text-ink-500">
            Generates a DRAFT raw-XBRL instance from POSTED ledger activity —
            instant concepts as of period end, duration concepts over the
            period. Validation runs before anything is saved for download.
          </p>
          <div>
            <Button type="submit">Generate</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
