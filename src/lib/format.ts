import type { Label, Metric } from "@/engine/types";

/** Shown wherever a figure could not be computed or was not stated. */
export const NO_FIGURE = "—";

/** $70.9M, $136.5M (rounded to the nearest $100k in decimal, so 70,850,000 is $70.9M), $500,000; null → —. */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NO_FIGURE;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(Math.round(abs / 100_000) / 10).toFixed(1)}M`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtMetric(n: number | null | undefined, format: Metric["format"]): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NO_FIGURE;
  if (format === "money") return fmtMoney(n);
  if (format === "percent") return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
  return n.toLocaleString("en-US");
}

export function fmtDelta(baseline: number, current: number, format: Metric["format"]): string {
  const d = current - baseline;
  if (Math.abs(d) < 1e-9) return "no change";
  const sign = d > 0 ? "+" : "-";
  if (format === "percent") return `${sign}${Math.abs(d).toFixed(Math.abs(d) % 1 ? 1 : 0)} pts`;
  if (format === "money") return `${sign}${fmtMoney(Math.abs(d))}`;
  return `${sign}${Math.abs(d).toLocaleString("en-US")}`;
}

export const LABEL_STYLES: Record<Label, { chip: string; dot: string; text: string }> = {
  confirmed: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-500", text: "Confirmed" },
  changed: { chip: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-500", text: "Changed" },
  contradicted: { chip: "bg-red-50 text-red-800 ring-red-600/20", dot: "bg-red-500", text: "Contradicted" },
  conflicting: { chip: "bg-purple-50 text-purple-800 ring-purple-600/20", dot: "bg-purple-500", text: "Conflicting" },
  unverified: { chip: "bg-slate-100 text-slate-700 ring-slate-500/20", dot: "bg-slate-400", text: "Unverified" },
};
export const LABEL_ORDER: Label[] = ["confirmed", "changed", "contradicted", "conflicting", "unverified"];
