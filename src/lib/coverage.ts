// Evidence coverage for one check: a deterministic cross-check of two independent model outputs. The classifier says
// which documents bear on each check; the evidence step either cites passages from a document or records a gap
// ("this document should state the value and doesn't"). A document the classifier marked relevant that produced
// neither is a possible missed passage, so the check lists it for a person to open. It is a tripwire, not proof of
// completeness: it cannot see a fact that no document states, and the classifier also marks documents relevant by
// association (some silent documents are benign).
import type { DocClassification, Evidence, Gap } from "@/engine/types";

export interface CheckCoverage {
  /** Documents the classifier marked relevant (the baseline document and different-project documents left out). */
  relevant: string[];
  /** Of those, documents with at least one cited passage. */
  cited: string[];
  /** Documents with no passage, only a recorded gap. */
  gapOnly: string[];
  /** Documents with neither: possibly missed. */
  silent: string[];
}

export function checkCoverage(
  assumptionId: string,
  classifications: DocClassification[],
  evidence: Evidence[],
  gaps: Gap[],
  /** The baseline (anchor) documents: what is being checked, never evidence. */
  anchors: ReadonlySet<string>,
): CheckCoverage {
  const relevant = classifications
    .filter((c) => c.relevantAssumptions.includes(assumptionId) && c.projectMatch !== "different_project" && !anchors.has(c.docId))
    .map((c) => c.docId);
  const cited = new Set(evidence.filter((e) => e.assumptionId === assumptionId).map((e) => e.docId));
  const flagged = new Set(gaps.filter((g) => g.assumptionId === assumptionId).map((g) => g.docId));
  return {
    relevant,
    cited: relevant.filter((d) => cited.has(d)),
    gapOnly: relevant.filter((d) => !cited.has(d) && flagged.has(d)),
    silent: relevant.filter((d) => !cited.has(d) && !flagged.has(d)),
  };
}
