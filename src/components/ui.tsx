"use client";
import type { ReactNode, Ref } from "react";
import type { Label, Quote, Rfi, SourceRole, Stance } from "@/engine/types";
import { LABEL_STYLES } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/meta";

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

export function PrimaryButton({ children, onClick, disabled, className, ref }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
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
      className="group inline-flex max-w-full items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-700 transition hover:border-slate-400 hover:bg-white"
    >
      <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 group-hover:bg-slate-900 group-hover:text-white">
        p.{quote.page}
      </span>
      <span className={cx("min-w-0", full ? "" : "truncate")}>
        <span className="text-slate-500">{docName}: </span>
        &ldquo;{quote.text}&rdquo;
      </span>
    </button>
  );
}

const SOURCE_STYLE: Record<SourceRole, string> = {
  seller: "bg-amber-50 text-amber-800 ring-amber-600/30",
  seller_advisor: "bg-slate-100 text-slate-700 ring-slate-400/50",
  independent: "bg-sky-50 text-sky-800 ring-sky-700/30",
  government: "bg-white text-slate-700 ring-slate-400/70",
  buyer: "bg-white text-slate-700 ring-slate-400/70",
  other: "bg-white text-slate-600 ring-slate-300",
};
/** Who produced a document: Seller / Seller's advisor / Independent / IRS or government. */
export function SourceTag({ role }: { role?: SourceRole }) {
  if (!role) return null;
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset", SOURCE_STYLE[role])}>{SOURCE_LABEL[role]}</span>;
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_STYLE: Record<Rfi["priority"], string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};
export const sortRfis = (rfis: Rfi[]) => [...rfis].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
export function PriorityBadge({ priority }: { priority: Rfi["priority"] }) {
  return <span className={cx("inline-block shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase", PRIORITY_STYLE[priority])}>{priority}</span>;
}
