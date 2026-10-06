import type { AssumptionDef, Metric } from "@/engine/types";

/** Assumption values keyed by assumption id. */
export type Values = Record<string, string | number | boolean | null | undefined>;

/** A playbook is everything transaction-specific. Add a folder + register it to support a new deal type. */
export interface Playbook {
  id: string;
  name: string;
  /** What the anchor (baseline) document is called in the UI, e.g. "Term sheet" or "LOI". */
  anchorLabel: string;
  /** The question the report answers. */
  question: string;
  /** Assumption whose short value names the deal in the UI (e.g. the project company). */
  dealNameFrom?: string;
  /** Domain framing given to Claude in every prompt. */
  context: string;
  assumptions: AssumptionDef[];
  /** Deterministic headline numbers. `current` holds resolved values; missing ids fall back to baseline. */
  metrics: (baseline: Values, current: Values) => Metric[];
}
