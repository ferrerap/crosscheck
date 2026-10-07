// Ingestion and quote verification: ingest every demo PDF, then check that known quotes verify and a
// fabricated one is rejected. Exits non-zero on any failure.  npx tsx scripts/check-ingest.ts [--dump D03]
import fs from "node:fs";
import path from "node:path";
import { ingest } from "../src/engine/ingest";
import { verifyQuote } from "../src/engine/verifyQuotes";
import type { DocRecord } from "../src/engine/types";

const DIR = path.join(process.cwd(), "public", "demo-data", "itc-transfer");

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".pdf")).sort();
  const docs = new Map<string, DocRecord>();
  for (const [i, f] of files.entries()) {
    const id = `D${String(i + 1).padStart(2, "0")}`;
    const d = await ingest(id, f, new Uint8Array(fs.readFileSync(path.join(DIR, f))), i === 0 ? "anchor" : "dataroom");
    docs.set(id, d);
    console.log(id, f, `${d.pages.length}p`, d.pages.map((p) => p.length).join("/"));
  }
  const checks: { docId: string; page: number; text: string; expected: boolean }[] = [
    { docId: "D01", page: 1, text: "Estimated eligible basis $142,000,000", expected: true },
    { docId: "D02", page: 1, text: "Total eligible basis $136,400,000", expected: true },
    { docId: "D03", page: 1, text: "Apprentice labor hours as % of total 13.2%", expected: true },
    { docId: "D06", page: 1, text: "we forecast the placed-in-service date on or about February 15, 2027", expected: true },
    // The quote is real but the page is wrong: verification must find it and correct the page.
    { docId: "D01", page: 2, text: "Estimated eligible basis $142,000,000", expected: true },
    // Fabricated quotes must be rejected, including a near-miss on a real sentence.
    { docId: "D02", page: 1, text: "this sentence does not exist", expected: false },
    { docId: "D02", page: 1, text: "Total eligible basis $136,900,000", expected: false },
    { docId: "D99", page: 1, text: "Total eligible basis $136,400,000", expected: false },
  ];
  let failures = 0;
  for (const c of checks) {
    const got = verifyQuote(docs, c);
    const ok = got.verified === c.expected && (!c.expected || got.page === 1);
    if (!ok) failures++;
    console.log(ok ? "PASS" : "FAIL", c.expected ? "verified" : "rejected", c.docId, `p${got.page}`, c.text);
  }
  if (docs.size !== 16) {
    failures++;
    console.log("FAIL expected 16 documents in the demo data room, found", docs.size);
  }
  if (process.argv.includes("--dump")) console.log(docs.get(process.argv[process.argv.indexOf("--dump") + 1] ?? "D01")?.pages.join("\n----\n"));
  if (failures) {
    console.log(`\n${failures} ingestion check(s) failed`);
    process.exit(1);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
