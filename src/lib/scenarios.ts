// Credit range across the ways the open questions to the seller could resolve.
// "changed" findings are data room facts (their currentValue always applies). Each contradicted,
// conflicting or unverified finding resolves either to the term sheet value or to its data room value.
// An open finding with no single data room value (e.g. sources disagree on a date) forks over the values
// its supporting/contradicting evidence states. Judgment-call options in `questions` add their own outcomes. Every combination runs through the
// playbook's deterministic metrics; the report shows the min and max.
import type { Evidence, Finding, Metric, Question } from "@/engine/types";
import type { Playbook, Values } from "@/playbooks/types";

export interface CreditRange {
  asSigned: Metric[]; // term sheet values
  dataRoomFacts: Metric[]; // term sheet + "changed" facts, open items assumed to resolve for the seller
  low: Metric[];
  high: Metric[];
  scenarios: number;
}

const OPEN = new Set(["contradicted", "conflicting", "unverified"]);

export function creditRange(
  p: Playbook,
  baseline: Values,
  findings: Finding[],
  questions: Question[],
  evidence: Evidence[],
  metricId = "credit",
): CreditRange {
  const facts: Values = {};
  const forks: Values[][] = [];
  const inQuestion = new Set(questions.flatMap((q) => q.assumptionIds));

  for (const f of findings) {
    const has = f.currentValue !== undefined && f.currentValue !== null;
    // A dependent finding's data room value is a fact; what it means is decided by the check it hangs on
    // (e.g. a 47.8% domestic content figure qualifies or not depending on the construction start year).
    if ((f.label === "changed" || f.dependsOn) && has) facts[f.assumptionId] = f.currentValue;
    else if (OPEN.has(f.label) && has && !inQuestion.has(f.assumptionId)) {
      forks.push([{}, { [f.assumptionId]: f.currentValue }]); // seller's position holds, or the data room's
    } else if (OPEN.has(f.label) && !has && !f.dependsOn) {
      const values = [...new Set(evidence
        .filter((e) => e.assumptionId === f.assumptionId && e.stance !== "context" && e.value !== null)
        .map((e) => JSON.stringify(e.value)))].map((v) => JSON.parse(v));
      if (values.length) forks.push([{}, ...values.map((v) => ({ [f.assumptionId]: v }))]);
    }
  }
  for (const q of questions) if (q.options.length) forks.push([{}, ...q.options.map((o) => o.sets as Values)]);

  // Cartesian product of forks (small: a handful of open items).
  let combos: Values[] = [{}];
  for (const fork of forks) combos = combos.flatMap((c) => fork.map((o) => ({ ...c, ...o })));

  const value = (m: Metric[]) => m.find((x) => x.id === metricId)?.current ?? 0;
  const runs = combos.map((c) => p.metrics(baseline, { ...facts, ...c }));
  const sorted = [...runs].sort((a, b) => value(a) - value(b));
  return {
    asSigned: p.metrics(baseline, {}),
    dataRoomFacts: p.metrics(baseline, facts),
    low: sorted[0],
    high: sorted[sorted.length - 1],
    scenarios: runs.length,
  };
}
