// Credit range across the ways the open questions to the seller could resolve.
// - "changed" findings are data room facts: their currentValue always applies.
// - A dependent finding's data room value is also a fact; what it means is decided by the check it hangs on
//   (e.g. a 47.8% domestic content figure qualifies or not depending on the construction start year).
// - Each other contradicted, conflicting or unverified finding is an open question: it resolves either to the
//   term sheet value (the seller's position holds) or against it:
//     * to its data room value, when it has one;
//     * for a yes/no assumption with no data room value (e.g. FEOC compliance, unverified), to "no";
//     * otherwise to each value its independent supporting/contradicting evidence states (sources disagree on
//       a date). Seller assertions are not independent evidence and never become an outcome.
// - Judgment-call options in `questions` add their own outcomes.
// Every combination runs through the playbook's deterministic metrics.
import type { Evidence, Finding, Metric, Question } from "@/engine/types";
import type { Playbook, Values } from "@/playbooks/types";

export interface CreditRange {
  asSigned: Metric[]; // term sheet values
  dataRoomFacts: Metric[]; // term sheet + data room facts; open questions resolve for the seller
  low: Metric[];
  high: Metric[];
  /** Low case if every unverified yes/no check clears (e.g. FEOC compliance shown). Same as low if none. */
  lowIfCleared: Metric[];
  /** Assumption ids whose clearing separates `low` from `lowIfCleared`. */
  clearable: string[];
  scenarios: number;
}

/** One open question: the assumptions it covers and its possible outcomes ({} = seller's position holds). */
interface Fork {
  ids: string[];
  outcomes: Values[];
  unverified: boolean; // a yes/no check with no evidence either way
}

export interface ScenarioInput {
  findings: Finding[];
  questions: Question[];
  evidence: Evidence[];
  /** Documents produced by the seller (classification sourceRole "seller"). */
  sellerDocs?: Set<string>;
}

const OPEN = new Set(["contradicted", "conflicting", "unverified"]);

function model(p: Playbook, baseline: Values, { findings, questions, evidence, sellerDocs }: ScenarioInput) {
  const facts: Values = {};
  const forks: Fork[] = [];
  const kind = new Map(p.assumptions.map((a) => [a.id, a.valueType]));
  // Only questions with options model an assumption; an option-less question must not hide it from the range.
  const inQuestion = new Set(questions.filter((q) => q.options.length).flatMap((q) => q.assumptionIds));
  for (const f of findings) {
    const id = f.assumptionId;
    const has = f.currentValue !== undefined && f.currentValue !== null;
    if ((f.label === "changed" || f.dependsOn) && has) facts[id] = f.currentValue;
    else if (!OPEN.has(f.label) || inQuestion.has(id)) continue;
    else if (has) forks.push({ ids: [id], outcomes: [{}, { [id]: f.currentValue }], unverified: false });
    else if (kind.get(id) === "boolean" && baseline[id] === true) forks.push({ ids: [id], outcomes: [{}, { [id]: false }], unverified: true });
    else if (!f.dependsOn) {
      const values = [...new Set(evidence
        .filter((e) => e.assumptionId === id && e.stance !== "context" && e.value !== null && !sellerDocs?.has(e.docId))
        .map((e) => JSON.stringify(e.value)))].map((v) => JSON.parse(v));
      if (values.length) forks.push({ ids: [id], outcomes: [{}, ...values.map((v) => ({ [id]: v }))], unverified: false });
    }
  }
  for (const q of questions)
    if (q.options.length) forks.push({ ids: q.assumptionIds, outcomes: [{}, ...q.options.map((o) => o.sets as Values)], unverified: false });
  return { facts, forks };
}

const valueOf = (m: Metric[], id: string) => m.find((x) => x.id === id)?.current ?? 0;

function product(forks: Fork[]): Values[] {
  let combos: Values[] = [{}];
  for (const fork of forks) combos = combos.flatMap((c) => fork.outcomes.map((o) => ({ ...c, ...o })));
  return combos;
}

export function creditRange(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): CreditRange {
  const { facts, forks } = model(p, baseline, input);
  const run = (fs: Fork[]) =>
    product(fs)
      .map((c) => p.metrics(baseline, { ...facts, ...c }))
      .sort((a, b) => valueOf(a, metricId) - valueOf(b, metricId));
  const all = run(forks);
  const cleared = run(forks.filter((f) => !f.unverified));
  const low = all[0];
  const lowIfCleared = cleared[0];
  return {
    asSigned: p.metrics(baseline, {}),
    dataRoomFacts: p.metrics(baseline, facts),
    low,
    high: all[all.length - 1],
    lowIfCleared,
    clearable: valueOf(lowIfCleared, metricId) > valueOf(low, metricId) ? forks.filter((f) => f.unverified).flatMap((f) => f.ids) : [],
    scenarios: all.length,
  };
}

/**
 * Credit at risk per check: how far the credit falls if this check goes against the seller (together with the
 * checks that hang on it), with every other open question resolving for the seller. Checks with no open
 * question of their own (confirmed, data room facts, dependents) get 0; dependents show their parent's exposure.
 */
export function creditAtRisk(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): Record<string, number> {
  const { facts, forks } = model(p, baseline, input);
  const top = valueOf(p.metrics(baseline, facts), metricId);
  const parentOf = new Map(input.findings.filter((f) => f.dependsOn).map((f) => [f.assumptionId, f.dependsOn!]));
  const out: Record<string, number> = {};
  for (const fork of forks) {
    if (fork.ids.every((id) => parentOf.has(id))) continue; // dependents count toward their parent
    const children = forks.filter((f) => f !== fork && f.ids.some((id) => fork.ids.includes(parentOf.get(id) ?? "")));
    const worst = Math.min(...product([fork, ...children]).map((o) => valueOf(p.metrics(baseline, { ...facts, ...o }), metricId)));
    for (const id of fork.ids) out[id] = Math.max(out[id] ?? 0, Math.round((top - worst) * 100) / 100);
  }
  return out;
}

/**
 * Credit already lost to data room facts: for each "changed" finding, how much lower the credit is with
 * that fact than with the term sheet value (every other fact applied, open questions for the seller).
 */
export function creditCutByFacts(p: Playbook, baseline: Values, input: ScenarioInput, metricId = "credit"): Record<string, number> {
  const { facts } = model(p, baseline, input);
  const withAll = valueOf(p.metrics(baseline, facts), metricId);
  const out: Record<string, number> = {};
  for (const f of input.findings) {
    if (f.label !== "changed" || !(f.assumptionId in facts)) continue;
    const rest = { ...facts };
    delete rest[f.assumptionId];
    const cut = Math.round((valueOf(p.metrics(baseline, rest), metricId) - withAll) * 100) / 100;
    if (cut > 0) out[f.assumptionId] = cut;
  }
  return out;
}

/** Everything the UI needs to tag each check with its credit impact. */
export interface CreditImpact {
  atRisk: Record<string, number>;
  cut: Record<string, number>;
}
