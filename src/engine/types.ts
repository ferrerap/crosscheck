// Core, transaction-agnostic types shared by every playbook. A run's state builds up in this order, each step adding
// to it and none overwriting an earlier one:
//   BaselineAssumption (what the anchor document states) → DocClassification (per document) →
//   Evidence and Gap (per passage; per statement a document should make and doesn't) →
//   Finding, Question, Rfi, Risk (per assertion) → Metric (computed in code, never by the model).
// The whole run is one JSON object (Run); a recorded one drives replay mode.

export type Label =
  | "confirmed" // current evidence matches the baseline assumption
  | "changed" // comparable value differs (numbers, dates)
  | "contradicted" // evidence negates a yes/no or categorical assumption
  | "conflicting" // current sources disagree; needs a human call
  | "unverified"; // missing, insufficient, or unexaminable evidence

export type ValueType = "money" | "percent" | "date" | "boolean" | "text" | "number";

/** A source document after ingestion. Page text is kept so quotes can be verified. */
export interface DocRecord {
  id: string; // stable short id, e.g. "D03"
  filename: string;
  sha256: string;
  role: "anchor" | "dataroom";
  pages: string[]; // pages[0] is page 1
  /** Some pages have no extractable text (likely scanned images); they are not read. */
  textless?: boolean;
}

/** A verbatim excerpt that Claude claims supports a value. */
export interface Quote {
  docId: string;
  page: number; // 1-indexed
  text: string;
  verified: boolean; // true only if text was found on that page by verifyQuotes()
}

/** Playbook definition of one assumption the deal depends on. */
export interface AssumptionDef {
  id: string; // e.g. "T2"
  name: string;
  valueType: ValueType;
  unit?: string;
  /**
   * "identity" = a project fact checked for consistency across every document (capacity, entity, site).
   * "term" = a deal term read from the anchor doc but not diligenced (e.g. price).
   */
  kind?: "identity" | "assumption" | "term";
  /** What to look for in the anchor document. */
  extractionHint: string;
  /** The evidence requirement: which documents and facts should exist in the data room if the assertion holds. */
  evidenceHint: string;
  /** The standard: how the evidence decides the label, including traps (e.g. a notice to proceed is not physical work). */
  rule: string;
}

export interface BaselineAssumption {
  id: string;
  value: string | number | boolean | null;
  display: string;
  /** Compact value for table cells (at most ~18 characters). */
  short?: string;
  quote: Quote | null;
  found: boolean;
}

export type ProjectMatch = "match" | "different_project" | "general_reference" | "unclear";

/** Who produced a document: drives the "Evidence" vs "Seller says" split. */
export type SourceRole = "seller" | "seller_advisor" | "supplier" | "independent" | "government" | "buyer" | "other";

export interface DocClassification {
  docId: string;
  docType: string;
  title: string;
  summary: string;
  projectMatch: ProjectMatch;
  projectMatchReason: string;
  relevantAssumptions: string[];
  /** Text in the document that tries to instruct an automated reviewer (ignored, but surfaced). */
  suspiciousInstructions?: string | null;
  /** Who produced the document. */
  sourceRole?: SourceRole;
}

export type Stance = "supports" | "contradicts" | "context";

export interface Evidence {
  assumptionId: string;
  docId: string;
  value: string | number | boolean | null;
  display: string;
  /** Compact value for table cells (at most ~18 characters). */
  short?: string;
  stance: Stance;
  note: string;
  quote: Quote;
}

/** A document that should have stated an assumption's value but didn't (shown as "not stated"). */
export interface Gap {
  assumptionId: string;
  docId: string;
  note: string;
}

/** A targeted request to the seller. */
export interface Rfi {
  id: string;
  request: string;
  reason: string;
  assumptionIds: string[];
  priority: "high" | "medium" | "low";
}

/** A flagged issue that needs no decision now but should be known (e.g. an insurance exclusion). */
export interface Risk {
  id: string;
  title: string;
  detail: string;
  assumptionIds: string[];
  evidence: Quote[];
}

export interface QuestionOption {
  id: string;
  label: string;
  /** Plain-English consequence shown under the option. */
  consequence: string;
  /** Resolved current values this answer implies, keyed by assumption id. */
  sets: Record<string, string | number | boolean>;
}

export interface Question {
  id: string;
  assumptionIds: string[];
  prompt: string;
  context: string;
  evidence: Quote[];
  options: QuestionOption[];
  answer?: string; // option id
}

export interface Finding {
  assumptionId: string;
  label: Label;
  baselineDisplay: string;
  currentDisplay: string;
  /** Resolved current machine value when determinable without a human decision. */
  currentValue?: string | number | boolean | null;
  /** Compact "what the data room says" for a table cell (at most ~40 characters). */
  currentShort?: string;
  /** Another assumption this one's outcome hangs on (e.g. domestic content hangs on construction start). */
  dependsOn?: string | null;
  summary: string;
  evidence: Evidence[];
  questionIds: string[];
  followUp?: string; // targeted request to the seller
}

/**
 * A headline number on the report, computed deterministically by the playbook. A figure is null when an input
 * it needs is missing or unusable; `missing` then names those inputs. A null with no `missing` means the input
 * itself was not stated (e.g. no insurance limit in the data room).
 */
export interface Metric {
  id: string;
  label: string;
  baseline: number | null;
  current: number | null;
  format: "money" | "percent" | "number";
  note?: string;
  missing?: string[];
}

export interface RunUsage {
  calls: number;
  /** All input tokens: uncached + cache writes + cache reads. */
  inputTokens: number;
  /** Of which written to / read from the prompt cache (absent on older recorded runs). */
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  outputTokens: number;
  costUsd: number;
}

export interface Run {
  id: string;
  playbookId: string;
  createdAt: string;
  mode: "live" | "replay";
  docs: Omit<DocRecord, "pages">[];
  baseline: BaselineAssumption[];
  baselineConfirmed: boolean;
  classifications: DocClassification[];
  evidence: Evidence[];
  gaps?: Gap[];
  findings: Finding[];
  questions: Question[];
  rfis?: Rfi[];
  risks?: Risk[];
  usage: RunUsage;
  /** Wall-clock seconds the recorded live run took (set by scripts/save-replay.ts). */
  durationSec?: number;
}
