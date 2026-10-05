// PDF → page text, server-side. Page text is what quotes are verified against.
import crypto from "node:crypto";
import type { DocRecord } from "./types";

export async function extractPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(text.replace(/[ \t]+/g, " ").trim());
  }
  await task.destroy();
  return pages;
}

export async function ingest(
  id: string,
  filename: string,
  bytes: Uint8Array,
  role: DocRecord["role"],
): Promise<DocRecord> {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return { id, filename, sha256, role, pages: await extractPages(bytes) };
}
