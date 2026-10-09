// The choices a reviewer has when deciding one check for the numbers. They are the outcomes the range already covers
// for that check (see scenarios.ts): the term sheet's value, each value a non-seller document states for it (with the
// passage), and "fails" for a yes/no assumption no document refutes. Choosing one replaces the model's resolution of
// the check in the math; the model's label is kept beside the decision.
import type { AssumptionDef, BaselineAssumption, Evidence, Finding } from "@/engine/types";
import type { Resolution } from "./scenarios";

export interface DecisionChoice {
  key: string;
  /** Shown in the picker. */
  label: string;
  /** The decision, without the reviewer's reason; null for the default (the model's resolution stands). */
  resolution: Omit<Resolution, "reason"> | null;
}

/**
 * Choices for one check, or null when there is nothing to decide here: a confirmed check, an identity fact or deal
 * term (no money depends on it), or a check that hangs on another open check (decide that one instead).
 */
export function decisionChoices(
  def: AssumptionDef,
  f: Finding,
  base: BaselineAssumption | undefined,
  evidence: Evidence[],
  sellerDocs: ReadonlySet<string>,
  docName: (id: string) => string,
  parentOpen: boolean,
): DecisionChoice[] | null {
  if (f.label === "confirmed" || def.kind === "identity" || def.kind === "term" || (f.dependsOn && parentOpen)) return null;
  // The math applies a "changed" value, or a dependent check's own value, as a fact (scenarios.ts); anything else is open.
  const isFact = f.label === "changed" || (!!f.dependsOn && f.currentValue !== undefined && f.currentValue !== null);
  const key = (v: unknown) => JSON.stringify(v);
  const skip = new Set([key(base?.value ?? null), ...(isFact ? [key(f.currentValue ?? null)] : [])]);
  const termShort = base?.short ?? base?.display ?? f.baselineDisplay;
  const choices: DecisionChoice[] = [
    {
      key: "default",
      label: isFact ? `Apply the data room value: ${f.currentShort ?? f.currentDisplay}` : "Leave open: the range covers every outcome",
      resolution: null,
    },
    {
      key: "terms",
      label: `Term sheet holds: ${termShort}`,
      resolution: { value: null, label: `term sheet holds (${termShort})`, source: base?.quote ?? null },
    },
  ];
  // Each value a non-seller document states (supporting or contradicting, not context), first passage wins.
  for (const e of evidence) {
    if (e.assumptionId !== f.assumptionId || e.stance === "context" || e.value === null || sellerDocs.has(e.docId) || skip.has(key(e.value))) continue;
    skip.add(key(e.value));
    const short = e.short ?? String(e.value);
    choices.push({
      key: `ev:${key(e.value)}`,
      label: `${short} (${docName(e.docId)}, p.${e.quote.page})`,
      resolution: { value: e.value, label: `${short} (${docName(e.docId).toLowerCase()})`, source: e.quote },
    });
  }
  if (def.valueType === "boolean" && base?.value === true && !skip.has(key(false)))
    choices.push({ key: "fails", label: "Not met: the assumption fails", resolution: { value: false, label: "not met", source: null } });
  return choices;
}
