// Date normalisation for values Claude extracts from documents ("December 2025", "12/22/2025", "Q4 2025").
// A parsed date keeps its precision, because tax rules that pivot on a day (June 16, 2025) cannot be
// applied to a month or quarter that straddles the pivot.

export type DatePrecision = "day" | "month" | "quarter" | "year";

export interface ParsedDate {
  /** Canonical form that re-parses to the same precision: YYYY-MM-DD, YYYY-MM, YYYY-Qn or YYYY. */
  iso: string;
  precision: DatePrecision;
  /** First and last possible day, as YYYY-MM-DD. */
  start: string;
  end: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function monthIndex(name: string): number | null {
  const n = name.toLowerCase().replace(/\.$/, "");
  const i = MONTHS.findIndex((m) => m === n || (n.length >= 3 && m.startsWith(n)));
  return i >= 0 ? i + 1 : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validDay = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

function day(y: number, m: number, d: number): ParsedDate | null {
  if (!validDay(y, m, d)) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return { iso, precision: "day", start: iso, end: iso };
}
function month(y: number, m: number): ParsedDate | null {
  if (m < 1 || m > 12) return null;
  return { iso: `${y}-${pad(m)}`, precision: "month", start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(daysIn(y, m))}` };
}
function quarter(y: number, q: number): ParsedDate | null {
  if (q < 1 || q > 4) return null;
  const m1 = (q - 1) * 3 + 1;
  return { iso: `${y}-Q${q}`, precision: "quarter", start: `${y}-${pad(m1)}-01`, end: `${y}-${pad(m1 + 2)}-${pad(daysIn(y, m1 + 2))}` };
}
function year(y: number): ParsedDate {
  return { iso: String(y), precision: "year", start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Parses the date formats documents and models commonly use. Returns null for anything else. */
export function toIsoDate(input: string | null | undefined): ParsedDate | null {
  if (!input) return null;
  const s = input.trim().replace(/\s+/g, " ");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/))) return day(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})-(\d{2})$/))) return month(+m[1], +m[2]);
  if ((m = s.match(/^(\d{4})$/))) return year(+m[1]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return day(+m[3], +m[1], +m[2]);
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) return day(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^q([1-4])[ -]?(\d{4})$/i))) return quarter(+m[2], +m[1]);
  if ((m = s.match(/^(\d{4})[ -]?q([1-4])$/i))) return quarter(+m[1], +m[2]);
  if ((m = s.match(/^([a-z]+\.?) (\d{1,2}),? (\d{4})$/i))) {
    const mi = monthIndex(m[1]);
    return mi ? day(+m[3], mi, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2}) ([a-z]+\.?),? (\d{4})$/i))) {
    const mi = monthIndex(m[2]);
    return mi ? day(+m[3], mi, +m[1]) : null;
  }
  if ((m = s.match(/^([a-z]+\.?),? (\d{4})$/i))) {
    const mi = monthIndex(m[1]);
    return mi ? month(+m[2], mi) : null;
  }
  return null;
}
