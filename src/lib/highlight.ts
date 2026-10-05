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

