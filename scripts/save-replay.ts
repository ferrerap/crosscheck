// Turns the latest eval result (a real live run) into the replay fixture the UI plays back.
//   npx tsx scripts/save-replay.ts [results-file.json]
import fs from "node:fs";
import path from "node:path";
import { loadDataRoom } from "../src/engine/dataroom";
import type { Run } from "../src/engine/types";

async function main() {
  const dir = path.join(process.cwd(), "evals", "itc-transfer", "results");
  const file = process.argv[2] ?? path.join(dir, fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().at(-1)!);
  const { results } = JSON.parse(fs.readFileSync(file, "utf8"));
  // The first run in the latest results file: the latest run, not the best one.
  const { run: r, usage, seconds } = results[0];
  const docs = await loadDataRoom("itc-transfer");

  const run: Run = {
    id: `replay-${path.basename(file, ".json")}`,
    playbookId: "itc-transfer",
    createdAt: new Date().toISOString(),
    mode: "replay",
    docs: docs.map(({ id, filename, sha256, role, textless }) => ({ id, filename, sha256, role, textless })),
    baseline: r.ex.baseline,
    baselineConfirmed: false,
    classifications: r.cl.classifications,
    evidence: r.ev.evidence,
    gaps: r.ev.gaps,
    findings: r.rc.findings,
    questions: r.rc.questions,
    rfis: r.rc.rfis,
    risks: r.rc.risks,
    usage,
    durationSec: typeof seconds === "number" ? Math.round(seconds) : undefined,
  };
  const out = path.join(process.cwd(), "src", "fixtures", "replay-itc-transfer.json");
  fs.writeFileSync(out, JSON.stringify(run, null, 2));
  console.log(`Saved replay from ${path.basename(file)}: ${run.findings.length} findings, ${run.questions.length} questions, $${usage.costUsd.toFixed(2)}`);
}
main();
