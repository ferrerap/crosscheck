// Checks that every quote in the replay fixture can be highlighted in the PDF viewer:
// runs the viewer's own matcher (src/lib/highlight.ts) over pdf.js text items for the quoted page.
//   npx tsx scripts/check-highlights.ts
import fs from "node:fs";
import path from "node:path";
import { matchQuote } from "../src/lib/highlight";
import type { Quote, Run } from "../src/engine/types";

const DIR = path.join(process.cwd(), "public", "demo-data", "itc-transfer");

async function main() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const run: Run = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "fixtures", "replay-itc-transfer.json"), "utf8"));
  const file = new Map(run.docs.map((d) => [d.id, d.filename]));
  const quotes: { where: string; q: Quote }[] = [
    ...run.baseline.flatMap((b) => (b.quote ? [{ where: `baseline ${b.id}`, q: b.quote }] : [])),
    ...run.evidence.map((e) => ({ where: `evidence ${e.assumptionId}`, q: e.quote })),
    ...run.questions.flatMap((qq) => qq.evidence.map((q) => ({ where: `question ${qq.id}`, q }))),
  ];
  const cache = new Map<string, string[][]>();
  let ok = 0, partial = 0, miss = 0;
  for (const { where, q } of quotes) {
    const f = file.get(q.docId)!;
    if (!cache.has(f)) {
      const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(DIR, f))), verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
      const pages: string[][] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        pages.push(tc.items.map((it) => ("str" in it ? (it.str as string) : "")));
      }
      cache.set(f, pages);
    }
    const items = cache.get(f)![q.page - 1] ?? [];
    const ranges = matchQuote(items, q.text);
    const covered = [...ranges.values()].reduce((n, [a, b]) => n + (b - a), 0);
    const want = q.text.replace(/\s+/g, "").length;
    if (ranges.size === 0) { miss++; console.log("MISS   ", where, q.docId, `p${q.page}`, q.text.slice(0, 80)); }
    else if (covered < want * 0.9) { partial++; console.log("PARTIAL", where, q.docId, `p${q.page}`, `${covered}/${want}`, q.text.slice(0, 80)); }
    else ok++;
  }
  console.log(`\n${ok} full, ${partial} partial, ${miss} missing of ${quotes.length} quotes`);
  // A partial highlight is a failure too: the viewer would paint only part of the quoted passage.
  process.exit(miss || partial ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
