"use server";

// Server Actions for filings.
//
// SECURITY: identical posture to recon's actions — requireCurrentUser +
// requireCurrentTenant (Clerk-backed; fail closed when unauthenticated),
// then every lookup is tenant-scoped. The entityId arrives from the
// client but is re-verified against the session tenant inside
// generateFiling — a UUID from another tenant is a hard error, not a read.

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCurrentTenant, requireCurrentUser } from "@/lib/auth/session";
import { FilingGenerationError, generateFiling } from "@/lib/xbrl/generate";

const CreateFilingSchema = z.object({
  entityId: z.string().uuid(),
  bookCode: z.string().trim().min(1).max(32),
  taxonomyVersion: z.string().trim().min(1).max(16),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  cik: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "CIK is a numeric SEC identifier")
    .optional()
    .or(z.literal("")),
  documentType: z.string().trim().max(16).optional().or(z.literal("")),
});

export interface CreateFilingResult {
  error?: string;
}

export async function createFilingAction(
  formData: FormData
): Promise<CreateFilingResult> {
  const user = await requireCurrentUser();
  const tenant = await requireCurrentTenant();

  const parsed = CreateFilingSchema.safeParse({
    entityId: formData.get("entityId"),
    bookCode: formData.get("bookCode"),
    taxonomyVersion: formData.get("taxonomyVersion"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    cik: formData.get("cik") ?? "",
    documentType: formData.get("documentType") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { error: "periodEnd must not precede periodStart." };
  }

  let filingId: string;
  try {
    const result = await generateFiling(prisma, {
      tenantId: tenant.id,
      entityId: parsed.data.entityId,
      bookCode: parsed.data.bookCode,
      taxonomyVersion: parsed.data.taxonomyVersion,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      cik: parsed.data.cik || null,
      documentType: parsed.data.documentType || null,
      createdBy: user.email,
    });
    filingId = result.filingId;
  } catch (e) {
    if (e instanceof FilingGenerationError) return { error: e.message };
    // Never leak internals (or ledger contents) through an action error.
    return { error: "Filing generation failed. Check the inputs and try again." };
  }

  revalidatePath("/filings");
  redirect(`/filings/${filingId}`);
}
