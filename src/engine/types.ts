// Core, transaction-agnostic types shared by every playbook.

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
  /** "term" = a deal term read from the anchor doc but not diligenced (e.g. price). */
  kind?: "assumption" | "term";
  /** What to look for in the anchor document. */
  extractionHint: string;
  /** What counts as current evidence in the data room. */
  evidenceHint: string;
  /** How to judge the label, including traps to avoid. */
  rule: string;
}

export interface BaselineAssumption {
  id: string;
  value: string | number | boolean | null;
  display: string;
  quote: Quote | null;
  found: boolean;
}

export type ProjectMatch = "match" | "different_project" | "general_reference" | "unclear";

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
}

export type Stance = "supports" | "contradicts" | "context";

export interface Evidence {
  assumptionId: string;
  docId: string;
  value: string | number | boolean | null;
  display: string;
  stance: Stance;
  note: string;
  quote: Quote;
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
  summary: string;
  evidence: Evidence[];
  questionIds: string[];
  followUp?: string; // targeted request to the seller
}

/** A headline number on the report, computed deterministically by the playbook. */
export interface Metric {
  id: string;
  label: string;
  baseline: number;
  current: number;
  format: "money" | "percent" | "number";
  note?: string;
}

export interface RunUsage {
  calls: number;
  inputTokens: number;
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
  findings: Finding[];
  questions: Question[];
  usage: RunUsage;
}
