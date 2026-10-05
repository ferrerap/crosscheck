// Builds page excerpts of real public documents for the data room.
// Usage: npx tsx scripts/excerpt-real-docs.ts <folder with downloaded originals>
// Originals and source URLs are listed in public/demo-data/itc-transfer/SOURCES.md.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const OUT = path.join(process.cwd(), "public", "demo-data", "itc-transfer");

const excerpts = [
  { src: "n-23-29-appendix-c.pdf", out: "13_IRS_Notice_2023-29_Appendix_C_excerpt.pdf", pages: [1, 20] },
  { src: "n-23-38.pdf", out: "14_IRS_Notice_2023-38_Domestic_Content_excerpt.pdf", pages: [1, 5] },
  { src: "n-26-15.pdf", out: "15_IRS_Notice_2026-15_PFE_Material_Assistance_excerpt.pdf", pages: [1, 2] },
  { src: "vermilion-mural.pdf", out: "16_Vermilion_County_Solar_Siting_Ordinance_excerpt.pdf", pages: [1, 4] },
];

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Pass the folder containing the downloaded originals.");
  for (const e of excerpts) {
    const src = await PDFDocument.load(fs.readFileSync(path.join(dir, e.src)), { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, e.pages.map((p) => p - 1));
    copied.forEach((p) => out.addPage(p));
    out.setTitle(`${e.out} (excerpt of ${e.src}, pages ${e.pages.join(", ")})`);
    fs.writeFileSync(path.join(OUT, e.out), await out.save());
    console.log("wrote", e.out);
  }
}
main();
