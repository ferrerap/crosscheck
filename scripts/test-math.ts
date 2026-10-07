// Deterministic checks: playbook math reproduces the gold scenarios. No API key needed.
//   npx tsx scripts/test-math.ts
import gold from "../evals/itc-transfer/gold.json";
import { dcThreshold, itcTransfer } from "../src/playbooks/itc-transfer";

const baseline = Object.fromEntries(Object.entries(gold.baseline).map(([k, v]) => [k, v.value]));
const resolved = { T2: 136400000, T5: 47.8, T7: "2027-02-15", T9: 55000000 };

let fail = 0;
const b = itcTransfer.metrics(baseline, {});
const check = (name: string, got: number | null, want: number) => {
  const ok = got !== null && Math.abs(got - want) < 0.5;
  if (!ok) fail++;
  console.log(ok ? "PASS" : "FAIL", name, got, ok ? "" : `(want ${want})`);
};
check("baseline rate", b[0].current, 50);
check("baseline credit", b[1].current, 71000000);
check("baseline price", b[2].current, 66385000);

for (const [name, s] of Object.entries(gold.scenarios)) {
  const m = itcTransfer.metrics(baseline, { ...resolved, ...s.answers });
  check(`${name} rate`, m[0].current, s.rate);
  check(`${name} credit`, m[1].current, s.credit);
}
// §48E domestic content threshold by construction start (June 16, 2025 pivot).
for (const [date, want] of [["2025-03-01", 40], ["2025-06-15", 40], ["2025-06-16", 45], ["2025-12", 45], ["2026-01-12", 50], ["2027-02-01", 55]] as const)
  check(`dc threshold ${date}`, dcThreshold(date).value, want);
process.exit(fail ? 1 : 0);
