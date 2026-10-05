// Dev helper: search a PDF's text.  npx tsx scripts/pdf-grep.ts <file.pdf> <regex> [contextChars]
import fs from "node:fs";
import { extractPages } from "../src/engine/ingest";

async function main() {
  const [file, pattern, ctx = "150"] = process.argv.slice(2);
  const pages = await extractPages(new Uint8Array(fs.readFileSync(file)));
  console.log(`${pages.length} pages`);
  const re = new RegExp(pattern, "gi");
  let hits = 0;
  pages.forEach((p, i) => {
    for (const m of p.matchAll(re)) {
      if (hits++ > 30) return;
      const s = Math.max(0, m.index! - Number(ctx));
      console.log(`--- p${i + 1}: ${p.slice(s, m.index! + Number(ctx)).replace(/\n/g, " | ")}`);
    }
  });
}
main();
