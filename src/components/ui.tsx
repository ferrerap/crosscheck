"use client";
import type { ReactNode } from "react";
import type { Label, Metric, Quote, Stance } from "@/engine/types";
import { LABEL_STYLES, fmtDelta, fmtMetric, fmtMoney } from "@/lib/format";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function LabelChip({ label, size = "md" }: { label: Label; size?: "sm" | "md" }) {
  const s = LABEL_STYLES[label];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        s.chip,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.text}
    </span>
  );
}

const STANCE: Record<Stance, string> = {
  supports: "bg-emerald-50 text-emerald-700",
  contradicts: "bg-red-50 text-red-700",
  context: "bg-slate-100 text-slate-600",
};
export function StanceTag({ stance }: { stance: Stance }) {
  return <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", STANCE[stance])}>{stance}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</section>;
}

export function PrimaryButton({ children, onClick, disabled, className }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700", className)} />;
}

/** A clickable citation that opens the source PDF at the quoted page. */
export function QuoteChip({
  quote,
  docName,
  onOpen,
  full,
}: {
  quote: Quote;
  docName: string;
  onOpen: (q: Quote) => void;
  full?: boolean;
}) {
  return (
    <button
      onClick={() => onOpen(quote)}
      title={quote.text}
      className="group inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-700 transition hover:border-slate-400 hover:bg-white"
    >
      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 group-hover:bg-slate-900 group-hover:text-white">
        {quote.docId} p.{quote.page}
      </span>
      <span className={cx("min-w-0", full ? "" : "truncate")}>
        <span className="text-slate-500">{docName}: </span>
        &ldquo;{quote.text}&rdquo;
      </span>
    </button>
  );
}

function deltaTone(baseline: number, current: number) {
  const d = current - baseline;
  if (Math.abs(d) < 1e-9) return "text-slate-500";
  return d < 0 ? "text-red-700" : "text-emerald-700";
}

export function MetricsStrip({ metrics, pending }: { metrics: Metric[]; pending?: boolean }) {
  const by = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const order = ["credit", "price", "rate", "insurance"].map((id) => by[id]).filter(Boolean);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="metrics-strip">
      {order.map((m) => {
        const isIns = m.id === "insurance";
        const required = by.price?.current ?? 0;
        const gap = m.current - required;
        return (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-sm text-slate-400 line-through decoration-slate-300">{fmtMetric(m.baseline, m.format)}</span>
              <span className="text-slate-300">&rarr;</span>
              <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums" data-testid={`metric-${m.id}`}>
                {fmtMetric(m.current, m.format)}
              </span>
            </div>
            {isIns ? (
              <div className={cx("mt-1 text-xs font-medium", gap < 0 ? "text-red-700" : "text-emerald-700")}>
                Required {fmtMoney(required)} &middot; {gap < 0 ? `shortfall ${fmtMoney(-gap)}` : `covers requirement (+${fmtMoney(gap)})`}
              </div>
            ) : (
              <div className={cx("mt-1 text-xs font-medium", deltaTone(m.baseline, m.current))}>
                {fmtDelta(m.baseline, m.current, m.format)}
                {pending && <span className="ml-1 font-normal text-slate-400">(undecided items at term sheet values)</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
