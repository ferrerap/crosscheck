// Credit range across the ways the open questions to the seller could resolve.
// - "changed" findings are data room facts: their currentValue always applies.
// - A dependent finding's data room value is also a fact; what it means is decided by the check it hangs on
//   (e.g. a 47.8% domestic content figure qualifies or not depending on the construction start year).
// - Each other contradicted, conflicting or unverified finding is an open question: it resolves either to the
//   term sheet value (the seller's position holds) or to its data room value. With no single data room value
//   (sources disagree on a date), it forks over the values its supporting/contradicting evidence states.
// - Judgment-call options in `questions` add their own outcomes.
// Every combination runs through the playbook's deterministic metrics.
import type { Evidence, Finding, Metric, Question } from "@/engine/types";
import type { Playbook, Values } from "@/playbooks/types";

export interface CreditRange {
  asSigned: Metric[]; // term sheet values
  dataRoomFacts: Metric[]; // term sheet + data room facts; open questions resolve for the seller
  low: Metric[];
  high: Metric[];
  scenarios: number;
}

/** One open question: the assumptions it covers and its possible outcomes ({} = seller's position holds). */
interface Fork {
  ids: string[];
  outcomes: Values[];
}

const OPEN = new Set(["contradicted", "conflicting", "unverified"]);

function model(findings: Finding[], questions: Question[], evidence: Evidence[]) {
  const facts: Values = {};
  const forks: Fork[] = [];
  const inQuestion = new Set(questions.flatMap((q) => q.assumptionIds));
  for (const f of findings) {
    const has = f.currentValue !== undefined && f.currentValue !== null;
    if ((f.label === "changed" || f.dependsOn) && has) facts[f.assumptionId] = f.currentValue;
    else if (OPEN.has(f.label) && has && !inQuestion.has(f.assumptionId)) {
      forks.push({ ids: [f.assumptionId], outcomes: [{}, { [f.assumptionId]: f.currentValue }] });
    } else if (OPEN.has(f.label) && !has && !f.dependsOn) {
      const values = [...new Set(evidence
        .filter((e) => e.assumptionId === f.assumptionId && e.stance !== "context" && e.value !== null)
        .map((e) => JSON.stringify(e.value)))].map((v) => JSON.parse(v));
      if (values.length) forks.push({ ids: [f.assumptionId], outcomes: [{}, ...values.map((v) => ({ [f.assumptionId]: v }))] });
    }
  }
  for (const q of questions)
    if (q.options.length) forks.push({ ids: q.assumptionIds, outcomes: [{}, ...q.options.map((o) => o.sets as Values)] });
  return { facts, forks };
}

const valueOf = (m: Metric[], id: string) => m.find((x) => x.id === id)?.current ?? 0;

export function creditRange(
  p: Playbook,
  baseline: Values,
  findings: Finding[],
  questions: Question[],
  evidence: Evidence[],
  metricId = "credit",
): CreditRange {
  const { facts, forks } = model(findings, questions, evidence);
  let combos: Values[] = [{}];
  for (const fork of forks) combos = combos.flatMap((c) => fork.outcomes.map((o) => ({ ...c, ...o })));
  const runs = combos.map((c) => p.metrics(baseline, { ...facts, ...c }));
  const sorted = [...runs].sort((a, b) => valueOf(a, metricId) - valueOf(b, metricId));
  return {
    asSigned: p.metrics(baseline, {}),
    dataRoomFacts: p.metrics(baseline, facts),
    low: sorted[0],
    high: sorted[sorted.length - 1],
    scenarios: runs.length,
  };
}

/**
 * Credit at risk per check: how far the credit falls if only this check goes against the seller,
 * with every other open question resolving for the seller. Checks with no open question of their own
 * (confirmed, data room facts, dependents) get 0; dependents show their parent's exposure instead.
 */
export function creditAtRisk(
  p: Playbook,
  baseline: Values,
  findings: Finding[],
  questions: Question[],
  evidence: Evidence[],
  metricId = "credit",
): Record<string, number> {
  const { facts, forks } = model(findings, questions, evidence);
  const top = valueOf(p.metrics(baseline, facts), metricId);
  const out: Record<string, number> = {};
  for (const fork of forks) {
    const worst = Math.min(...fork.outcomes.map((o) => valueOf(p.metrics(baseline, { ...facts, ...o }), metricId)));
    for (const id of fork.ids) out[id] = Math.max(out[id] ?? 0, Math.round((top - worst) * 100) / 100);
  }
  return out;
}
