"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { BaselineAssumption } from "@/engine/types";
import { GROUPS, assumptionKind, assumptionName } from "@/lib/meta";
import { Card, PrimaryButton, cx } from "./ui";

const PdfPane = dynamic(() => import("./PdfPane"), { ssr: false });

export function BaselineStep({
  baseline,
  termSheetName,
  termSheetUrl,
  onConfirm,
}: {
  baseline: BaselineAssumption[];
  termSheetName: string;
  termSheetUrl: string;
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(baseline[0]?.id ?? null);

  const highlights = useMemo(
    () => baseline.flatMap((b) => (b.quote ? [{ page: b.quote.page, text: b.quote.text, id: b.id }] : [])),
    [baseline],
  );
  const all = confirmed.size === baseline.length;
  const toggle = (id: string) =>
    setConfirmed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Baseline: what the term sheet assumes</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Extracted from <span className="font-medium text-slate-800">{termSheetName}</span>. Every value is highlighted in the term sheet on the right;
            click a row to jump to its source. Confirm each one before the data room is checked against it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-slate-500">
            {confirmed.size} of {baseline.length} confirmed
          </span>
          <button
            onClick={() => setConfirmed(new Set(baseline.map((b) => b.id)))}
            disabled={all}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm all
          </button>
          <PrimaryButton disabled={!all} onClick={onConfirm}>
            Continue
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[45fr_55fr]">
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const rows = baseline.filter((b) => assumptionKind(b.id) === g.kind);
            if (!rows.length) return null;
            return (
              <section key={g.kind}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-slate-100">
                    {rows.map((b) => {
                      const done = confirmed.has(b.id);
                      const sel = selected === b.id;
                      return (
                        <li
                          key={b.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected(b.id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(b.id)}
                          data-testid={`baseline-${b.id}`}
                          className={cx(
                            "flex cursor-pointer items-start gap-3 border-l-4 px-4 py-3 transition",
                            sel ? "border-orange-400 bg-orange-50/60" : "border-transparent hover:bg-slate-50",
                            done && "bg-slate-50/70",
                          )}
                        >
                          <span className="mt-0.5 w-7 shrink-0 font-mono text-xs font-semibold text-slate-400">{b.id}</span>
                          <div className="min-w-0 flex-1">
                            <div className={cx("text-xs font-medium", done ? "text-slate-400" : "text-slate-500")}>{assumptionName(b.id)}</div>
                            <div className={cx("mt-0.5 text-sm leading-snug", done ? "text-slate-500" : "font-medium text-slate-900")}>{b.display}</div>
                            {!b.quote && <div className="mt-1 text-xs text-amber-700">Not found in the term sheet</div>}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(b.id);
                            }}
                            aria-pressed={done}
                            className={cx(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition",
                              done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
                            )}
                          >
                            {done ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                                  <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Confirmed
                              </>
                            ) : (
                              "Confirm"
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>

        <div className="sticky top-20 h-[calc(100vh-6.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <PdfPane url={termSheetUrl} highlights={highlights} activeId={selected} className="h-full" />
        </div>
      </div>
    </div>
  );
}
