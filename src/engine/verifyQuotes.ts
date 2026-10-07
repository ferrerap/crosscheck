// Every quote Claude returns is checked against the source page text.
// A quote that can't be found is kept but marked unverified, and the UI says so.
import type { DocRecord, Quote } from "./types";

/**
 * Normalize for matching: case, whitespace, quote marks and dashes. Hyphens and any whitespace after them are
 * removed on both sides, so "cost-segregation", "cost- segregation" and a PDF's "cost-\nsegregation" all match.
 * src/lib/highlight.ts applies the same rules character by character for the viewer.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/-\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalised page text, computed once per document.
const normalizedPages = new WeakMap<DocRecord, string[]>();
function pagesOf(doc: DocRecord): string[] {
  let pages = normalizedPages.get(doc);
  if (!pages) {
    pages = doc.pages.map(normalize);
    normalizedPages.set(doc, pages);
  }
  return pages;
}

/** Returns the page (1-indexed) where the quote appears, preferring the claimed page, or null. */
export function locate(doc: DocRecord, text: string, claimedPage?: number): number | null {
  const q = normalize(text);
  if (q.length < 4) return null;
  const pages = pagesOf(doc);
  const order = claimedPage ? [claimedPage, ...pages.map((_, i) => i + 1).filter((p) => p !== claimedPage)] : pages.map((_, i) => i + 1);
  for (const p of order) {
    const page = pages[p - 1];
    if (page !== undefined && page.includes(q)) return p;
  }
  return null;
}

/** Prompts escape document text (see renderDocs); quotes come back escaped and are restored here. */
const unescapeText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function verifyQuote(docs: Map<string, DocRecord>, raw: Omit<Quote, "verified">): Quote {
  const quote = { ...raw, text: unescapeText(raw.text) };
  const doc = docs.get(quote.docId);
  if (!doc) return { ...quote, verified: false };
  const page = locate(doc, quote.text, quote.page);
  return page === null ? { ...quote, verified: false } : { ...quote, page, verified: true };
}
