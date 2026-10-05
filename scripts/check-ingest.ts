// Sanity check: ingest every demo PDF, print page counts, and verify a few known quotes.
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
  const checks = [
    { docId: "D01", page: 1, text: "Estimated eligible basis $142,000,000" },
    { docId: "D02", page: 1, text: "Total eligible basis $136,400,000" },
    { docId: "D03", page: 1, text: "Apprentice labor hours as % of total 13.2%" },
    { docId: "D06", page: 1, text: "we forecast the placed-in-service date on or about February 15, 2027" },
    { docId: "D02", page: 1, text: "this sentence does not exist" },
  ];
  for (const c of checks) console.log(verifyQuote(docs, c).verified ? "OK  " : "MISS", c.docId, c.text);
  if (process.argv.includes("--dump")) console.log(docs.get(process.argv[3] ?? "D01")?.pages.join("\n----\n"));
}
main();
