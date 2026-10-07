// Credit range across the ways the open questions to the seller could resolve.
// - "changed" findings are data room facts: their currentValue always applies. When the model returned no value
//   for one, the single independent value in the evidence stands in; several distinct values become a fork; none
//   leaves the check unresolved (and noted as such).
// - A dependent finding's data room value is also a fact; what it means is decided by the check it hangs on
//   (e.g. a 47.8% domestic content figure qualifies or not depending on the construction start year).
// - Each other contradicted, conflicting or unverified finding is an open question: it resolves either to the
//   term sheet value (the seller's position holds) or against it:
//     * for a yes/no assumption with no data room value (e.g. FEOC compliance, unverified), to "no";
//     * to its data room value, when it has one;
//     * otherwise to each value its independent supporting/contradicting evidence states (sources disagree on
//       a date). Seller assertions are not independent evidence and never become an outcome.
// - Judgment-call options in `questions` add their own outcomes.
// Every combination runs through the playbook's deterministic metrics. A figure a scenario cannot compute stays
// null and is excluded from the low/high selection; the count of such scenarios is reported.
import type { Evidence, Finding, Metric, Question } from "@/engine/types";
import type { Playbook, Values } from "@/playbooks/types";

/** Enumerating more scenarios than this is a sign the inputs are wrong, not a case to approximate silently. */
export const MAX_SCENARIOS = 100_000;

export interface CreditRange {
  asSigned: Metric[]; // term sheet values
  dataRoomFacts: Metric[]; // term sheet + data room facts; open questions resolve for the seller
  low: Metric[];
  high: Metric[];
  /** Low case if every unverified yes/no check clears (e.g. FEOC compliance shown). Same as low if none. */
  lowIfCleared: Metric[];
  /** Assumption ids whose clearing separates `low` from `lowIfCleared`. */
  clearable: string[];
  /** Non-confirmed checks that could be placed in neither the facts nor a fork (no usable data room value). */
  unresolved: string[];
  scenarios: number;
  /** Scenarios whose credit could not be computed (an input missing or unusable). */
  notComputable: number;
}

/** One open question: the assumptions it covers and its possible outcomes ({} = seller's position holds). */
export interface Fork {
  ids: string[];
  outcomes: Values[];
  unverified: boolean; // a yes/no check with no evidence either way
  source: "finding" | "question";
}

export interface ScenarioInput {
  findings: Finding[];
  questions: Question[];
  evidence: Evidence[];
  /** Documents produced by the seller (classification sourceRole "seller"). */
  sellerDocs?: Set<string>;
}

export interface ScenarioModel {
  facts: Values;
  forks: Fork[];
  unresolved: string[];
}

const OPEN = new Set(["contradicted", "conflicting", "unverified"]);

/** Facts, forks and unresolved checks for a run. Exported for tests; the range functions build on it. */
export function modelScenarios(p: Playbook, baseline: Values, { findings, questions, evidence, sellerDocs }: ScenarioInput): ScenarioModel {
  const facts: Values = {};
  const forks: Fork[] = [];
  const unresolved: string[] = [];
  const kind = new Map(p.assumptions.map((a) => [a.id, a.valueType]));
  // Only questions with options model an assumption; an option-less question must not hide it from the range.
  const inQuestion = new Set(questions.filter((q) => q.options.length).flatMap((q) => q.assumptionIds));
  const independentValues = (id: string): (string | number | boolean)[] =>
    [...new Set(evidence
      .filter((e) => e.assumptionId === id && e.stance !== "context" && e.value !== null && !sellerDocs?.has(e.docId))
      .map((e) => JSON.stringify(e.value)))].map((v) => JSON.parse(v));
  const fork = (id: string, outcomes: Values[], unverified = false) => forks.push({ ids: [id], outcomes: [{}, ...outcomes], unverified, source: "finding" });

  for (const f of findings) {
    const id = f.assumptionId;
    if (f.label === "confirmed") continue;
    const has = f.currentValue !== undefined && f.currentValue !== null;
    const value = f.currentValue as string | number | boolean;
    const yesNoAssumed = kind.get(id) === "boolean" && baseline[id] === true;

    if (has && (f.label === "changed" || f.dependsOn)) {
      facts[id] = value;
      continue;
    }
    if (f.label === "changed") {
      // The data room value differs but the model did not return it: take it from the evidence.
      const values = independentValues(id);
      if (values.length === 1) facts[id] = values[0];
      else if (values.length > 1) fork(id, values.map((v) => ({ [id]: v })));
      else if (yesNoAssumed) fork(id, [{ [id]: false }], true);
      else unresolved.push(id);
      continue;
    }
    if (!OPEN.has(f.label)) continue;
    // An unverified yes/no assumption can always turn out "no", even when a judgment call also mentions it
    // (an option that sets it explicitly is applied after this fork and wins).
    if (!has && yesNoAssumed) {
      fork(id, [{ [id]: false }], true);
      continue;
    }
    if (inQuestion.has(id)) continue; // modelled by that question's options
    if (has) {
      fork(id, [{ [id]: value }]);
      continue;
    }
    if (f.dependsOn) continue; // the check it hangs on decides it; its own value falls back to the term sheet
    const values = independentValues(id);
    if (values.length) fork(id, values.map((v) => ({ [id]: v })));
    else unresolved.push(id);
  }
  for (const q of questions)
    if (q.options.length) forks.push({ ids: q.assumptionIds, outcomes: [{}, ...q.options.map((o) => o.sets as Values)], unverified: false, source: "question" });
  return { facts, forks, unresolved };
}

const num = (m: Metric[], id: string): number | null => m.find((x) => x.id === id)?.current ?? null;

/** Every combination of fork outcomes. Refuses to enumerate past MAX_SCENARIOS rather than hang or approximate. */
export function product(forks: Fork[]): Values[] {
  const size = forks.reduce((n, f) => n * f.outcomes.length, 1);
  if (size > MAX_SCENARIOS) throw new Error(`too many open checks to enumerate (${size} scenarios)`);
  let combos: Values[] = [{}];
  for (const fork of forks) combos = combos.flatMap((c) => fork.outcomes.map((o) => ({ ...c, ...o })));
  return combos;
}

export function creditRange(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): CreditRange {
  const { facts, forks, unresolved } = modelScenarios(p, baseline, input);
  const run = (fs: Fork[]) => {
    const all = product(fs).map((c) => p.metrics(baseline, { ...facts, ...c }));
    const numeric = all.filter((m) => num(m, metricId) !== null).sort((a, b) => num(a, metricId)! - num(b, metricId)!);
    return { all, numeric };
  };
  const every = run(forks);
  const cleared = run(forks.filter((f) => !f.unverified));
  const low = every.numeric[0] ?? every.all[0];
  const high = every.numeric[every.numeric.length - 1] ?? every.all[0];
  const lowIfCleared = cleared.numeric[0] ?? cleared.all[0];
  const lowValue = num(low, metricId);
  const clearedValue = num(lowIfCleared, metricId);
  return {
    asSigned: p.metrics(baseline, {}),
    dataRoomFacts: p.metrics(baseline, facts),
    low,
    high,
    lowIfCleared,
    clearable: lowValue !== null && clearedValue !== null && clearedValue > lowValue ? forks.filter((f) => f.unverified).flatMap((f) => f.ids) : [],
    unresolved,
    scenarios: every.all.length,
    notComputable: every.all.length - every.numeric.length,
  };
}

/**
 * Credit at risk per check: how far the credit falls if this check goes against the seller (together with the
 * checks that hang on it), with every other open question resolving for the seller. Checks with no open
 * question of their own (confirmed, data room facts, dependents) get 0; dependents show their parent's exposure.
 * Empty when the credit itself cannot be computed.
 */
export function creditAtRisk(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): Record<string, number> {
  const { facts, forks } = modelScenarios(p, baseline, input);
  const top = num(p.metrics(baseline, facts), metricId);
  if (top === null) return {};
  const parentOf = new Map(input.findings.filter((f) => f.dependsOn).map((f) => [f.assumptionId, f.dependsOn!]));
  const out: Record<string, number> = {};
  for (const fork of forks) {
    if (fork.ids.every((id) => parentOf.has(id))) continue; // dependents count toward their parent
    const children = forks.filter((f) => f !== fork && f.ids.some((id) => fork.ids.includes(parentOf.get(id) ?? "")));
    let worst = Infinity;
    for (const o of product([fork, ...children])) {
      const v = num(p.metrics(baseline, { ...facts, ...o }), metricId);
      if (v !== null && v < worst) worst = v;
    }
    if (worst === Infinity) continue;
    for (const id of fork.ids)
      if (!parentOf.has(id)) out[id] = Math.max(out[id] ?? 0, Math.round((top - worst) * 100) / 100);
  }
  return out;
}

/**
 * Credit already lost to data room facts: for each "changed" finding, how much lower the credit is with
 * that fact than with the term sheet value (every other fact applied, open questions for the seller).
 */
export function creditCutByFacts(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): Record<string, number> {
  const { facts } = modelScenarios(p, baseline, input);
  const withAll = num(p.metrics(baseline, facts), metricId);
  if (withAll === null) return {};
  const out: Record<string, number> = {};
  for (const f of input.findings) {
    if (f.label !== "changed" || !(f.assumptionId in facts)) continue;
    const rest = { ...facts };
    delete rest[f.assumptionId];
    const without = num(p.metrics(baseline, rest), metricId);
    if (without === null) continue;
    const cut = Math.round((without - withAll) * 100) / 100;
    if (cut > 0) out[f.assumptionId] = cut;
  }
  return out;
}

/** Everything the UI needs to tag each check with its credit impact. */
export interface CreditImpact {
  atRisk: Record<string, number>;
  cut: Record<string, number>;
  /** Checks whose data room value could not be resolved into the math. */
  unresolved: string[];
}
