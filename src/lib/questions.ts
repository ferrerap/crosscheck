import type { DocClassification, Finding, Quote, Rfi, Risk } from "@/engine/types";

/**
 * Quotes a reader can open (the evidence under each check and the quotes behind each risk) that were not found on
 * the page they cite. The check page and the report both count from here, so they report the same number.
 */
export function unverifiedQuotes(findings: Finding[], risks: Risk[]): Quote[] {
  return [...findings.flatMap((f) => f.evidence.map((e) => e.quote)), ...risks.flatMap((k) => k.evidence)].filter((q) => !q.verified);
}

/** Questions to the seller that belong to a check on the page (each counted once). */
export function reachableRfis(rfis: Rfi[], findings: Finding[]): Rfi[] {
  const ids = new Set(findings.map((f) => f.assumptionId));
  return rfis.filter((r) => r.assumptionIds.some((a) => ids.has(a)));
}

/** The questions that will be sent: reachable and still ticked. */
export function sendableRfis(rfis: Rfi[], findings: Finding[], accepted: Set<string>): Rfi[] {
  return reachableRfis(rfis, findings).filter((r) => accepted.has(r.id));
}

/**
 * Risks shown to the reader. The flag about an embedded instruction is kept off the pages (Paul's decision):
 * a risk tied to no check whose quotes all come from a document flagged for suspicious instructions.
 */
export function readerRisks(risks: Risk[], classifications: DocClassification[]): Risk[] {
  const flagged = new Set(classifications.filter((c) => c.suspiciousInstructions).map((c) => c.docId));
  return risks.filter((k) => !(k.assumptionIds.length === 0 && k.evidence.length > 0 && k.evidence.every((q) => flagged.has(q.docId))));
}
