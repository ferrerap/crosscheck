"use client";
import { Fragment, useState } from "react";
import type { Finding, Label, Metric, Question, Quote, Rfi, Risk, RunUsage } from "@/engine/types";
import { LABEL_ORDER, fmtMoney } from "@/lib/format";
import { GROUPS, assumptionKind, assumptionName } from "@/lib/meta";
import { Card, LabelChip, MetricsStrip, QuoteChip, StanceTag, cx } from "./ui";
import { AssumptionChips, PriorityBadge, sortRfis } from "./ReviewStep";

const COLS = "lg:grid-cols-[13rem_7.5rem_11rem_13rem_1fr]";

export function ReportStep({
  metrics,
  findings,
  questions,
  answers,
  rfis,
  risks,
  usage,
  onOpen,
  docName,
}: {
  metrics: Metric[];
  findings: Finding[];
  questions: Question[];
  answers: Record<string, string>;
  rfis: Rfi[];
  risks: Risk[];
  usage: RunUsage;
  onOpen: (q: Quote) => void;
  docName: (id: string) => string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const counts = LABEL_ORDER.map((l) => [l, findings.filter((f) => f.label === l).length] as [Label, number]);
  // Prefer the dedicated RFI list; older runs only carry per-finding follow-ups.
  const requests: { key: string; priority?: Rfi["priority"]; text: string; reason?: string; ids: string[] }[] = rfis.length
    ? sortRfis(rfis).map((r) => ({ key: r.id, priority: r.priority, text: r.request, reason: r.reason, ids: r.assumptionIds }))
    : findings.filter((f) => f.followUp).map((f) => ({ key: f.assumptionId, text: f.followUp!, ids: [f.assumptionId] }));
  const unverified = findings.flatMap((f) => f.evidence).filter((e) => !e.quote.verified).length;
  const decisionFor = (f: Finding) => {
    for (const qid of f.questionIds) {
      const q = questions.find((x) => x.id === qid);
      const o = q?.options.find((x) => x.id === answers[qid]);
      if (o) return o.label;
    }
    return null;
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Report &middot; Cottonwood Solar I</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Does the data room support the term sheet?</h2>

      <div className="mt-6">
        <MetricsStrip metrics={metrics} />
        <p className="mt-2 text-xs text-slate-500">
          Struck-through values are the term sheet; bold values reflect diligence findings and your recorded decisions. Computed deterministically.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2" data-testid="label-summary">
        <span className="mr-1 text-sm font-medium text-slate-700">{findings.length} assumptions:</span>
        {counts
          .filter(([, n]) => n > 0)
          .map(([l, n]) => (
            <span key={l} className="flex items-center gap-1.5">
              <LabelChip label={l} />
              <span className="text-sm font-semibold tabular-nums text-slate-800">{n}</span>
            </span>
          ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className={cx("hidden gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid", COLS)}>
          <div>Assumption</div>
          <div>Status</div>
          <div>Term sheet</div>
          <div>Current</div>
          <div>Why</div>
        </div>
        {GROUPS.map((g) => {
          const rows = findings.filter((f) => assumptionKind(f.assumptionId) === g.kind);
          if (!rows.length) return null;
          return (
            <Fragment key={g.kind}>
              <div className="border-b border-slate-200 bg-slate-100/80 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</div>
              <ul className="divide-y divide-slate-100 border-b border-slate-100 last:border-b-0">
                {rows.map((f) => {
                  const isOpen = !!open[f.assumptionId];
                  const decision = decisionFor(f);
                  return (
                    <li key={f.assumptionId}>
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [f.assumptionId]: !isOpen }))}
                        aria-expanded={isOpen}
                        className={cx("grid w-full gap-2 px-5 py-4 text-left transition hover:bg-slate-50 lg:items-start lg:gap-4", COLS)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cx("mt-0.5 text-slate-400 transition", isOpen && "rotate-90")}>&#9656;</span>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{assumptionName(f.assumptionId)}</div>
                            <div className="font-mono text-[11px] text-slate-400">{f.assumptionId}</div>
                          </div>
                        </div>
                        <div>
                          <LabelChip label={f.label} />
                        </div>
                        <div className="text-sm text-slate-600">
                          <span className="mr-1 text-[11px] uppercase text-slate-400 lg:hidden">Term sheet: </span>
                          {f.baselineDisplay}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          <span className="mr-1 text-[11px] font-normal uppercase text-slate-400 lg:hidden">Current: </span>
                          {f.currentDisplay}
                          {decision && <div className="mt-1 text-xs font-normal text-slate-600">Decision: {decision}</div>}
                        </div>
                        <div className="text-sm leading-relaxed text-slate-600">{f.summary}</div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 lg:pl-14" data-testid={`evidence-${f.assumptionId}`}>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Evidence ({f.evidence.length})</div>
                          <ul className="mt-2 space-y-3">
                            {f.evidence.map((e, i) => (
                              <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <StanceTag stance={e.stance} />
                                  <span className="font-semibold text-slate-800">{e.display}</span>
                                  <span className="text-slate-400">&middot;</span>
                                  <span className="text-slate-600">{e.note}</span>
                                </div>
                                <div className="mt-2">
                                  <QuoteChip quote={e.quote} docName={docName(e.docId)} onOpen={onOpen} full />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Fragment>
          );
        })}
      </Card>

      {requests.length > 0 && (
        <section className="mt-10" data-testid="report-rfis">
          <h3 className="text-lg font-semibold tracking-tight">RFIs to the seller</h3>
          <ol className="mt-3 space-y-2">
            {requests.map((r, i) => (
              <li key={r.key} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
                <span className="font-mono text-xs font-semibold text-slate-400">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.priority && <PriorityBadge priority={r.priority} />}
                    <AssumptionChips ids={r.ids} />
                  </div>
                  <div className="mt-1 font-medium text-slate-800">{r.text}</div>
                  {r.reason && <div className="mt-0.5 text-[13px] text-slate-500">{r.reason}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {risks.length > 0 && (
        <section className="mt-10" data-testid="report-risks">
          <h3 className="text-lg font-semibold tracking-tight">Risks to note</h3>
          <ul className="mt-3 space-y-2">
            {risks.map((k) => (
              <li key={k.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{k.title}</span>
                  <AssumptionChips ids={k.assumptionIds} />
                </div>
                <p className="mt-1 leading-relaxed text-slate-600">{k.detail}</p>
                <div className="mt-2 flex flex-col items-start gap-1.5">
                  {k.evidence.map((e, i) => (
                    <QuoteChip key={i} quote={e} docName={docName(e.docId)} onOpen={onOpen} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section className="mt-10">
          <h3 className="text-lg font-semibold tracking-tight">Decisions recorded</h3>
          <ul className="mt-3 space-y-2">
            {questions.map((q) => {
              const o = q.options.find((x) => x.id === answers[q.id]);
              return (
                <li key={q.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{q.assumptionIds.join(", ")}</div>
                  <div className="mt-1 font-medium text-slate-900">{q.prompt}</div>
                  <div className="mt-1.5 text-slate-800">
                    <span className="font-semibold">Chosen: </span>
                    {o?.label ?? "No answer"}
                  </div>
                  {o && <div className="mt-0.5 text-slate-600">{o.consequence}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="mt-12 border-t border-slate-200 pt-5 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className={cx("font-medium", unverified ? "text-amber-700" : "text-emerald-700")}>
            {unverified ? `${unverified} quotes could not be verified` : "Every quote verified against source text"}
          </span>
          <span data-testid="usage">
            {usage.calls} model calls &middot; {(usage.inputTokens / 1000).toFixed(1)}k input / {(usage.outputTokens / 1000).toFixed(1)}k output tokens &middot; ${usage.costUsd.toFixed(2)}
          </span>
          <span>Credit amount {fmtMoney(metrics.find((m) => m.id === "credit")?.current ?? 0)} computed in code, not by the model.</span>
        </div>
      </footer>
    </div>
  );
}
