"use client";
import { useState } from "react";
import type { Question, Quote, Rfi, Risk } from "@/engine/types";
import type { Metric } from "@/engine/types";
import { assumptionName } from "@/lib/meta";
import { Card, MetricsStrip, PrimaryButton, QuoteChip, cx } from "./ui";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
export const PRIORITY_STYLE: Record<Rfi["priority"], string> = {
  high: "bg-red-50 text-red-800 ring-red-600/20",
  medium: "bg-amber-50 text-amber-800 ring-amber-600/25",
  low: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

export const sortRfis = (rfis: Rfi[]) => [...rfis].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

export function PriorityBadge({ priority }: { priority: Rfi["priority"] }) {
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset", PRIORITY_STYLE[priority])}>{priority}</span>;
}

export function AssumptionChips({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((a) => (
        <span key={a} title={assumptionName(a)} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
          {a}
        </span>
      ))}
    </>
  );
}

export function ReviewStep({
  metrics,
  questions,
  answers,
  rfis,
  risks,
  allAnswered,
  onAnswer,
  onOpen,
  onBuild,
  docName,
}: {
  metrics: Metric[];
  questions: Question[];
  answers: Record<string, string>;
  rfis: Rfi[];
  risks: Risk[];
  allAnswered: boolean;
  onAnswer: (qid: string, oid: string) => void;
  onOpen: (q: Quote) => void;
  onBuild: () => void;
  docName: (id: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const sorted = sortRfis(rfis);

  const copy = async () => {
    const text = sorted.map((r, i) => `${i + 1}. [${r.priority.toUpperCase()}] ${r.request}\n   Reason: ${r.reason}\n   Relates to: ${r.assumptionIds.join(", ")}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <MetricsStrip metrics={metrics} pending={!allAnswered} />
      </div>

      {questions.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold tracking-tight">Judgment calls</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            The documents conflict or a human call is needed. Pick an option and the headline numbers above recompute immediately.
          </p>
          <div className="mt-5 space-y-6">
            {questions.map((q, i) => (
              <JudgmentCard key={q.id} q={q} index={i} answer={answers[q.id]} onAnswer={(oid) => onAnswer(q.id, oid)} onOpen={onOpen} docName={docName} />
            ))}
          </div>
        </section>
      )}

      {sorted.length > 0 && (
        <section className="mt-12" data-testid="rfis">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">RFIs to the seller</h2>
              <p className="mt-1 text-sm text-slate-600">{sorted.length} targeted requests, highest priority first.</p>
            </div>
            <button
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 6.5l2.5 2.5L10 3.5" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied
                </>
              ) : (
                "Copy RFI list"
              )}
            </button>
          </div>
          <Card className="mt-3 overflow-hidden">
            <ol className="divide-y divide-slate-100">
              {sorted.map((r, i) => (
                <li key={r.id} className="flex gap-4 px-5 py-3.5">
                  <span className="w-5 shrink-0 pt-0.5 font-mono text-xs font-semibold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={r.priority} />
                      <AssumptionChips ids={r.assumptionIds} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-snug text-slate-900">{r.request}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{r.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      )}

      {risks.length > 0 && (
        <section className="mt-12" data-testid="risks">
          <h2 className="text-xl font-semibold tracking-tight">Risks to note</h2>
          <p className="mt-1 text-sm text-slate-600">No decision needed now, but worth knowing before you sign.</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {risks.map((k) => (
              <Card key={k.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <AssumptionChips ids={k.assumptionIds} />
                </div>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{k.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{k.detail}</p>
                <div className="mt-3 flex flex-col items-start gap-1.5">
                  {k.evidence.map((e, i) => (
                    <QuoteChip key={i} quote={e} docName={docName(e.docId)} onOpen={onOpen} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex items-center justify-end gap-3">
        {!allAnswered && <span className="text-sm text-slate-500">Resolve every judgment call to build the report.</span>}
        <PrimaryButton disabled={!allAnswered} onClick={onBuild}>
          Build report
        </PrimaryButton>
      </div>
    </div>
  );
}

function JudgmentCard({
  q,
  index,
  answer,
  onAnswer,
  onOpen,
  docName,
}: {
  q: Question;
  index: number;
  answer?: string;
  onAnswer: (optionId: string) => void;
  onOpen: (q: Quote) => void;
  docName: (id: string) => string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Judgment call {index + 1}</span>
        <span className="text-slate-300">/</span>
        <AssumptionChips ids={q.assumptionIds} />
      </div>
      <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-900">{q.prompt}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{q.context}</p>
      <div className="mt-4 flex flex-col items-start gap-1.5">
        {q.evidence.map((e, i) => (
          <QuoteChip key={i} quote={e} docName={docName(e.docId)} onOpen={onOpen} />
        ))}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={q.prompt}>
        {q.options.map((o) => {
          const sel = answer === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={sel}
              onClick={() => onAnswer(o.id)}
              className={cx("rounded-lg border p-4 text-left transition", sel ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white hover:border-slate-400")}
            >
              <div className="flex items-start gap-2.5">
                <span className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", sel ? "border-white" : "border-slate-300")}>
                  {sel && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="text-sm font-semibold leading-snug">{o.label}</span>
              </div>
              <p className={cx("mt-2 pl-6 text-[13px] leading-relaxed", sel ? "text-slate-200" : "text-slate-600")}>{o.consequence}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
