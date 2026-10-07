// Small display helpers shared by the step components.
import type { BaselineAssumption, DocClassification, SourceRole } from "@/engine/types";
import { activePlaybook } from "./activePlaybook";

// Names and kinds come from the active playbook; check names say what is being checked (G4).
export const assumptionName = (id: string) => activePlaybook.assumptions.find((a) => a.id === id)?.name ?? id;
export const assumptionKind = (id: string) => activePlaybook.assumptions.find((a) => a.id === id)?.kind ?? "assumption";

/** The deal's name: the value of the playbook's naming assumption (e.g. the project company) without a trailing ", LLC". */
export function dealNameOf(baseline: BaselineAssumption[], fallback: string): string {
  const row = baseline.find((b) => b.id === activePlaybook.dealNameFrom);
  return (row?.short ?? row?.display ?? fallback).replace(/,?\s+(LLC|Inc\.?|L\.P\.|LP)$/i, "");
}

/** "cost_segregation_report" -> "Cost segregation report" */
export const humanize = (t: string) => {
  const s = t.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Short doc type for column headers: drops parentheticals and slashes, e.g. "IRS official list (Notice 2023-29 App. C)" -> "IRS official list". */
const plainType = (t: string) => humanize(t.replace(/\(.*?\)/g, "").replace(/\s*\/\s*/g, "/")).trim();
export const shortType = (t: string) => {
  const s = plainType(t);
  return s.length > 28 ? s.slice(0, 27).trimEnd() + "…" : s;
};

/**
 * Human name for each document: its humanized type, or its title when two documents share a type
 * (e.g. two IRS guidance excerpts).
 */
export function docLabels(cls: DocClassification[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const c of cls) count.set(plainType(c.docType), (count.get(plainType(c.docType)) ?? 0) + 1);
  return new Map(
    cls.map((c) => {
      const t = plainType(c.docType);
      const label = (count.get(t) ?? 0) > 1 ? c.title.replace(/\s+excerpt$/i, "") : t;
      return [c.docId, label] as const;
    }),
  );
}

export const SOURCE_LABEL: Record<SourceRole, string> = {
  seller: "Seller",
  seller_advisor: "Seller's advisor",
  supplier: "Supplier",
  independent: "Independent",
  government: "IRS or government",
  buyer: "Buyer",
  other: "Other",
};

export const GROUPS = [
  { kind: "identity", label: "Project identity" },
  { kind: "assumption", label: "Credit assumptions" },
  { kind: "term", label: "Deal terms" },
] as const;
