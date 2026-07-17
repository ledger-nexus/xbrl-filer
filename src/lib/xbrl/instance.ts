// Raw XBRL 2.1 instance document builder — pure string assembly.
//
// v1 scope (per docs/ARCHITECTURE.md): a plain XBRL instance, NOT iXBRL.
// Two contexts (one instant, one duration), one USD unit, monetary facts
// with decimals="2". Dimensions, footnotes, and typed members are v2.
//
// The schemaRef points at the published us-gaap entry point recorded on
// the taxonomy row; v1 does not fetch or validate against the schema —
// structural correctness is asserted by construction and the calc checks
// in validate.ts. Arelle-grade validation is v2.

import type { FactValue, InstanceMeta } from "./types";

const CONTEXT_INSTANT = "C_I";
const CONTEXT_DURATION = "C_D";
const UNIT_USD = "U_USD";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildInstance(meta: InstanceMeta, facts: FactValue[]): string {
  const p = meta.taxonomyPrefix;
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"` +
      ` xmlns:link="http://www.xbrl.org/2003/linkbase"` +
      ` xmlns:xlink="http://www.w3.org/1999/xlink"` +
      ` xmlns:iso4217="http://www.xbrl.org/2003/iso4217"` +
      ` xmlns:${p}="${esc(meta.taxonomyNamespace)}">`
  );
  lines.push(
    `  <link:schemaRef xlink:type="simple" xlink:href="${esc(meta.schemaRefHref)}"/>`
  );

  const entity =
    `    <xbrli:entity>` +
    `<xbrli:identifier scheme="${esc(meta.entityScheme)}">${esc(meta.entityIdentifier)}</xbrli:identifier>` +
    `</xbrli:entity>`;

  lines.push(`  <xbrli:context id="${CONTEXT_INSTANT}">`);
  lines.push(entity);
  lines.push(
    `    <xbrli:period><xbrli:instant>${isoDate(meta.periodEnd)}</xbrli:instant></xbrli:period>`
  );
  lines.push(`  </xbrli:context>`);

  lines.push(`  <xbrli:context id="${CONTEXT_DURATION}">`);
  lines.push(entity);
  lines.push(
    `    <xbrli:period><xbrli:startDate>${isoDate(meta.periodStart)}</xbrli:startDate>` +
      `<xbrli:endDate>${isoDate(meta.periodEnd)}</xbrli:endDate></xbrli:period>`
  );
  lines.push(`  </xbrli:context>`);

  lines.push(`  <xbrli:unit id="${UNIT_USD}">`);
  lines.push(`    <xbrli:measure>iso4217:USD</xbrli:measure>`);
  lines.push(`  </xbrli:unit>`);

  for (const fact of facts) {
    const contextRef =
      fact.periodType === "INSTANT" ? CONTEXT_INSTANT : CONTEXT_DURATION;
    // qname arrives namespace-qualified ("us-gaap:Assets"); emit the local
    // name under the declared prefix so the xmlns binding is authoritative.
    const local = fact.qname.includes(":") ? fact.qname.split(":")[1] : fact.qname;
    lines.push(
      `  <${p}:${local} contextRef="${contextRef}" unitRef="${UNIT_USD}" decimals="2">` +
        `${fact.value.toFixed(2)}</${p}:${local}>`
    );
  }

  lines.push(`</xbrli:xbrl>`);
  return lines.join("\n") + "\n";
}

export function contextRefFor(periodType: "INSTANT" | "DURATION"): string {
  return periodType === "INSTANT" ? CONTEXT_INSTANT : CONTEXT_DURATION;
}
