// Checks the credit range and per-check credit impact for the replay fixture against gold (no API calls).
//   npx tsx scripts/check-range.ts
import fs from "node:fs";
import path from "node:path";
import { creditAtRisk, creditCutByFacts, creditRange } from "../src/lib/scenarios";
import { itcTransfer } from "../src/playbooks/itc-transfer";
import type { Run } from "../src/engine/types";

const run: Run = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "fixtures", "replay-itc-transfer.json"), "utf8"));
const baseline = Object.fromEntries(run.baseline.map((b) => [b.id, b.value]));
const input = {
  findings: run.findings,
  questions: run.questions,
  evidence: run.evidence,
  sellerDocs: new Set(run.classifications.filter((c) => c.sourceRole === "seller").map((c) => c.docId)),
};
const r = creditRange(itcTransfer, baseline, input);
const risk = creditAtRisk(itcTransfer, baseline, input);
const cut = creditCutByFacts(itcTransfer, baseline, input);
const credit = (m: { id: string; current: number }[]) => m.find((x) => x.id === "credit")!.current;
console.log(`as signed ${credit(r.asSigned)}  range ${credit(r.low)} - ${credit(r.high)}  if ${r.clearable.join(",")} cleared ${credit(r.lowIfCleared)}  (${r.scenarios} scenarios)`);
console.log("at risk", risk, "cut by facts", cut);
const checks: [string, boolean][] = [
  ["as signed $71.0M", credit(r.asSigned) === 71000000],
  ["high $68.2M", credit(r.high) === 68200000],
  ["low $0 (2026 start + FEOC fails)", credit(r.low) === 0],
  ["low if FEOC cleared $10.9M", credit(r.lowIfCleared) === 10912000 && r.clearable.includes("T8")],
  ["construction start puts $68.2M at risk (with FEOC)", risk.T6 === 68200000],
  ["apprenticeship puts $54.6M at risk", risk.T3 === 54560000],
  ["FEOC counted under construction start", !("T8" in risk)],
  ["basis fact cuts $2.8M", cut.T2 === 2800000],
];
for (const [name, ok] of checks) console.log(ok ? "PASS" : "FAIL", name);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
