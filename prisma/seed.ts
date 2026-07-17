// Seed: the us-gaap v1 concept subset + the hand-authored Northwind mapping.
//
// Idempotent — safe to re-run. Seeds ONLY xbrl-filer-owned tables; never
// writes a ledger-core table. The Northwind mapping attaches to whatever
// tenant owns the NORTHWIND entity in the shared DB (the ledger-core demo
// seed); if no NORTHWIND entity exists the mapping step is skipped with a
// note, and mappings can be authored later per entity.
//
// Run: set -a; source .env; set +a; npx tsx prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import { CONCEPTS, NORTHWIND_MAPPING, US_GAAP_2024 } from "../src/lib/xbrl/catalog";

const prisma = new PrismaClient();

async function main() {
  const taxonomy = await prisma.xbrlTaxonomy.upsert({
    where: {
      namespace_version: {
        namespace: US_GAAP_2024.namespace,
        version: US_GAAP_2024.version,
      },
    },
    create: {
      name: US_GAAP_2024.name,
      namespace: US_GAAP_2024.namespace,
      version: US_GAAP_2024.version,
      prefix: US_GAAP_2024.prefix,
      schemaRefHref: US_GAAP_2024.schemaRefHref,
    },
    update: { schemaRefHref: US_GAAP_2024.schemaRefHref },
  });
  console.log(`taxonomy ${taxonomy.version}: ${taxonomy.id}`);

  for (const c of CONCEPTS) {
    await prisma.xbrlConcept.upsert({
      where: { taxonomyId_qname: { taxonomyId: taxonomy.id, qname: c.qname } },
      create: {
        taxonomyId: taxonomy.id,
        qname: c.qname,
        label: c.label,
        periodType: c.periodType,
        balance: c.balance,
      },
      update: { label: c.label, periodType: c.periodType, balance: c.balance },
    });
  }
  console.log(`${CONCEPTS.length} concepts upserted`);

  const northwind = await prisma.legalEntity.findFirst({
    where: { code: "NORTHWIND" },
    select: { id: true, tenantId: true },
  });
  if (!northwind) {
    console.log("No NORTHWIND entity in this DB — skipping demo mapping.");
    return;
  }

  const concepts = await prisma.xbrlConcept.findMany({
    where: { taxonomyId: taxonomy.id },
    select: { id: true, qname: true },
  });
  const conceptId = new Map(concepts.map((c) => [c.qname, c.id]));

  let rows = 0;
  for (const m of NORTHWIND_MAPPING) {
    const cid = conceptId.get(m.conceptQname);
    if (!cid) continue;
    for (const code of m.accountCodes) {
      await prisma.xbrlConceptMapping.upsert({
        where: {
          tenantId_entityId_taxonomyId_conceptId_accountCode: {
            tenantId: northwind.tenantId,
            entityId: northwind.id,
            taxonomyId: taxonomy.id,
            conceptId: cid,
            accountCode: code,
          },
        },
        create: {
          tenantId: northwind.tenantId,
          entityId: northwind.id,
          taxonomyId: taxonomy.id,
          conceptId: cid,
          accountCode: code,
          createdBy: "seed",
        },
        update: {},
      });
      rows++;
    }
  }
  console.log(`${rows} Northwind mapping rows upserted`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
