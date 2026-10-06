// Locates a quoted passage within a PDF page's text items, for highlighting in the viewer.
// Kept free of React/pdf.js imports so scripts can test it in Node.

export type Range = [number, number]; // char offsets within one text item

function normChar(c: string): string {
  if (c === "‘" || c === "’" || c === "‛") return "'";
  if (c === "“" || c === "”") return '"';
  if (c >= "‐" && c <= "―") return "-";
  return c.toLowerCase();
}

/** Normalizes text (case, whitespace, quotes, dashes) while recording where each char came from. */
function normalizeWithMap(parts: string[]) {
  const chars: string[] = [];
  const map: { item: number; off: number }[] = [];
  const push = (ch: string, item: number, off: number) => {
    if (ch === " ") {
      if (chars.length === 0 || chars[chars.length - 1] === " ") return;
    }
    chars.push(ch);
    map.push({ item, off });
  };
  parts.forEach((str, item) => {
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      push(/\s/.test(c) ? " " : normChar(c), item, i);
    }
    push(" ", item, str.length); // items are separated by whitespace
  });
  return { text: chars.join(""), map };
}

function normalizeQuote(q: string): string {
  return normalizeWithMap([q]).text.trim();
}

/** Finds the quote across text items and returns per-item char ranges to highlight. */
export function matchQuote(items: string[], quote: string): Map<number, Range> {
  const out = new Map<number, Range>();
  const q = normalizeQuote(quote);
  if (!q) return out;
  const { text, map } = normalizeWithMap(items);
  let at = text.indexOf(q);
  let len = q.length;
  if (at < 0) {
    // Fuzzy fallback: longest prefix (>= 60% of the quote) that still matches, to survive small differences.
    for (let n = q.length - 1; n >= Math.ceil(q.length * 0.6) && at < 0; n--) {
      at = text.indexOf(q.slice(0, n));
      len = n;
    }
  }
  if (at < 0) return out;
  for (let i = at; i < at + len; i++) {
    const { item, off } = map[i];
    if (off >= items[item].length) continue; // separator
    const cur = out.get(item);
    out.set(item, cur ? [Math.min(cur[0], off), Math.max(cur[1], off + 1)] : [off, off + 1]);
  }
  return out;
}

export interface HighlightQuote {
  id: string;
  text: string;
}
export interface ItemMark {
  range: Range;
  ids: string[]; // every quote covering this segment (quotes may overlap)
}

/**
 * Locates several quotes on one page at once. Returns, per text item, non-overlapping segments to paint
 * (sorted by start offset); where quotes overlap, the segment carries all of their ids.
 */
export function matchQuotes(items: string[], quotes: HighlightQuote[]): Map<number, ItemMark[]> {
  const raw = new Map<number, { range: Range; id: string }[]>();
  for (const q of quotes) {
    for (const [item, range] of matchQuote(items, q.text)) {
      const list = raw.get(item) ?? [];
      list.push({ range, id: q.id });
      raw.set(item, list);
    }
  }
  const out = new Map<number, ItemMark[]>();
  for (const [item, list] of raw) {
    const cuts = [...new Set(list.flatMap((m) => m.range))].sort((x, y) => x - y);
    const segs: ItemMark[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [lo, hi] = [cuts[i], cuts[i + 1]];
      const ids = list.filter((m) => m.range[0] <= lo && m.range[1] >= hi).map((m) => m.id);
      if (ids.length) segs.push({ range: [lo, hi], ids });
    }
    out.set(item, segs);
  }
  return out;
}
