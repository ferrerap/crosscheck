// Prints the credit range for the replay fixture (no API calls).  npx tsx scripts/check-range.ts
import fs from "node:fs";
import path from "node:path";
import { creditRange } from "../src/lib/scenarios";
import { itcTransfer } from "../src/playbooks/itc-transfer";
import type { Run } from "../src/engine/types";

const run: Run = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "fixtures", "replay-itc-transfer.json"), "utf8"));
const baseline = Object.fromEntries(run.baseline.map((b) => [b.id, b.value]));
const r = creditRange(itcTransfer, baseline, run.findings, run.questions, run.evidence);
const credit = (m: { id: string; current: number }[]) => m.find((x) => x.id === "credit")!.current;
console.log(`as signed ${credit(r.asSigned)}  facts-only ${credit(r.dataRoomFacts)}  range ${credit(r.low)} – ${credit(r.high)}  (${r.scenarios} scenarios)`);
const ok = credit(r.asSigned) === 71000000 && credit(r.high) === 68200000 && credit(r.low) === 10912000;
console.log(ok ? "PASS range matches gold scenarios" : "FAIL range");
process.exit(ok ? 0 : 1);
