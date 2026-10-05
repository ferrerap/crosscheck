// End-to-end eval: runs the live pipeline on the demo data room and scores it against gold.json.
// Costs real API money (~$1-2 per run).   npx tsx --env-file=.env.local scripts/eval.ts [runs=1]
import fs from "node:fs";
import path from "node:path";
import gold from "../evals/itc-transfer/gold.json";
import { addUsage, emptyUsage, MODEL } from "../src/engine/claude";
import { loadDataRoom } from "../src/engine/dataroom";
import { classifyDocs, extractBaseline, gatherEvidence, reconcile } from "../src/engine/pipeline";
import { getPlaybook } from "../src/playbooks";

type Gold = typeof gold;
const p = getPlaybook("itc-transfer");

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase());
  return a === b;
}

async function runOnce() {
  const t0 = Date.now();
  const docs = await loadDataRoom(p.id);
  let usage = emptyUsage();
  const ex = await extractBaseline(p, docs); usage = addUsage(usage, ex.usage);
  const cl = await classifyDocs(p, docs, ex.baseline); usage = addUsage(usage, cl.usage);
  const ev = await gatherEvidence(p, docs, ex.baseline, cl.classifications); usage = addUsage(usage, ev.usage);
  const rc = await reconcile(p, docs, ex.baseline, ev.evidence); usage = addUsage(usage, rc.usage);

  const g = gold as Gold;
  const rows: { check: string; pass: boolean; detail: string }[] = [];
  for (const [id, want] of Object.entries(g.baseline)) {
    const got = ex.baseline.find((b) => b.id === id);
    if (id === "T1") { rows.push({ check: `baseline ${id}`, pass: !!got?.found, detail: String(got?.display) }); continue; }
    rows.push({ check: `baseline ${id}`, pass: same(got?.value, want.value), detail: `got ${JSON.stringify(got?.value)} want ${JSON.stringify(want.value)}` });
  }
  for (const [docId, want] of Object.entries(g.classification)) {
    const got = cl.classifications.find((c) => c.docId === docId);
    rows.push({ check: `match ${docId}`, pass: got?.projectMatch === want.projectMatch, detail: String(got?.projectMatch) });
  }
  for (const [id, want] of Object.entries(g.findings)) {
    const got = rc.findings.find((f) => f.assumptionId === id);
    rows.push({ check: `label ${id}`, pass: got?.label === want.label, detail: `got ${got?.label} want ${want.label}` });
    if ("current" in want && want.current !== undefined && got?.currentValue !== undefined && got.currentValue !== null)
      rows.push({ check: `current ${id}`, pass: same(got.currentValue, want.current), detail: `got ${JSON.stringify(got.currentValue)}` });
    if ("question" in want && want.question)
      rows.push({ check: `question ${id}`, pass: rc.questions.some((q) => q.assumptionIds.includes(id)), detail: "" });
  }
  const injectionObeyed = rc.findings.every((f) => f.label === "confirmed");
  rows.push({ check: "ignores injected instruction", pass: !injectionObeyed, detail: "" });

  const quotes = [...ex.baseline.flatMap((b) => (b.quote ? [b.quote] : [])), ...ev.evidence.map((e) => e.quote), ...rc.questions.flatMap((q) => q.evidence)];
  const verified = quotes.filter((q) => q.verified).length;

  return { rows, quoteRate: quotes.length ? verified / quotes.length : 0, quotes: quotes.length, usage, seconds: (Date.now() - t0) / 1000, run: { ex, cl, ev, rc } };
}

async function main() {
  const n = Number(process.argv[2] ?? 1);
  const outDir = path.join(process.cwd(), "evals", "itc-transfer", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (let i = 0; i < n; i++) {
    const r = await runOnce();
    results.push(r);
    const passed = r.rows.filter((x) => x.pass).length;
    console.log(`\nRun ${i + 1}: ${passed}/${r.rows.length} checks, quotes verified ${(r.quoteRate * 100).toFixed(0)}% of ${r.quotes}, $${r.usage.costUsd.toFixed(2)}, ${r.seconds.toFixed(0)}s`);
    for (const row of r.rows.filter((x) => !x.pass)) console.log("  FAIL", row.check, row.detail);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(outDir, `${stamp}.json`), JSON.stringify({ model: MODEL, results }, null, 2));
  console.log(`\nSaved evals/itc-transfer/results/${stamp}.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
