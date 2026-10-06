// Small display helpers shared by the step components.
import type { DocClassification } from "@/engine/types";
import { itcTransfer } from "@/playbooks/itc-transfer";

export const assumptionName = (id: string) => itcTransfer.assumptions.find((a) => a.id === id)?.name ?? id;
export const assumptionKind = (id: string) => itcTransfer.assumptions.find((a) => a.id === id)?.kind ?? "assumption";

/** "cost_segregation_report" -> "Cost segregation report" */
export const humanize = (t: string) => {
  const s = t.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Short doc type for column headers: drops parentheticals and slashes, e.g. "IRS official list (Notice 2023-29 App. C)" -> "IRS official list". */
export const shortType = (t: string) => {
  const s = humanize(t.replace(/\(.*?\)/g, "").replace(/\s*\/\s*/g, "/")).trim();
  return s.length > 28 ? s.slice(0, 27).trimEnd() + "…" : s;
};

export const isInjection = (c: DocClassification) =>
  !!c.suspiciousInstructions || /embedded instruction|prompt injection|addressed to automated|aimed at automated/i.test(c.summary);

export const GROUPS = [
  { kind: "identity", label: "Project identity" },
  { kind: "assumption", label: "Credit assumptions" },
  { kind: "term", label: "Deal terms" },
] as const;
