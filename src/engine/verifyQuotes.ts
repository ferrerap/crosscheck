// Every quote Claude returns is checked against the source page text.
// A quote that can't be found is kept but marked unverified, and the UI says so.
import type { DocRecord, Quote } from "./types";

/** Normalize for matching: case, whitespace, quote marks, dashes, and line-break hyphenation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the page (1-indexed) where the quote appears, preferring the claimed page, or null. */
export function locate(doc: DocRecord, text: string, claimedPage?: number): number | null {
  const q = normalize(text);
  if (q.length < 4) return null;
  const order = claimedPage ? [claimedPage, ...doc.pages.map((_, i) => i + 1).filter((p) => p !== claimedPage)] : doc.pages.map((_, i) => i + 1);
  for (const p of order) {
    const page = doc.pages[p - 1];
    if (page !== undefined && normalize(page).includes(q)) return p;
  }
  return null;
}

export function verifyQuote(docs: Map<string, DocRecord>, quote: Omit<Quote, "verified">): Quote {
  const doc = docs.get(quote.docId);
  if (!doc) return { ...quote, verified: false };
  const page = locate(doc, quote.text, quote.page);
  return page === null ? { ...quote, verified: false } : { ...quote, page, verified: true };
}
