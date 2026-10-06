"use client";
import { Fragment, useState } from "react";
import type { Finding, Label, Metric, Quote, Rfi, Risk, RunUsage } from "@/engine/types";
import { LABEL_ORDER, fmtMetric, fmtMoney } from "@/lib/format";
import { GROUPS, assumptionKind, assumptionName } from "@/lib/meta";
import type { CreditImpact, CreditRange } from "@/lib/scenarios";
import { creditTag } from "@/lib/creditTag";
import { Card, CreditPill, LabelChip, PriorityBadge, QuoteChip, StanceTag, cx, sortRfis } from "./ui";

const COLS = "lg:grid-cols-[11rem_7rem_9rem_12rem_9.5rem_1fr]";

const pick = (m: Metric[], id: string) => m.find((x) => x.id === id);
const span = (lo: number, hi: number, f: Metric["format"]) => (Math.abs(hi - lo) < 1e-9 ? fmtMetric(lo, f) : `${fmtMetric(lo, f)}–${fmtMetric(hi, f)}`);

function CheckTags({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((a) => (
        <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
          {assumptionName(a)}
        </span>
      ))}
    </>
  );
}

export function ReportStep({
  dealName,
  range,
  findings,
  impact,
  rfis,
  edits,
  risks,
  usage,
  onOpen,
  docName,
}: {
  /** The deal's name, from the project company check (falls back to the term sheet file). */
  dealName: string;
  range: CreditRange;
  findings: Finding[];
  /** Credit at risk per check and credit already cut by data room facts (see scenarios.ts). */
  impact: CreditImpact;
  /** The questions that were accepted for sending. */
  rfis: Rfi[];
  edits: Record<string, string>;
  risks: Risk[];
  usage: RunUsage;
  onOpen: (q: Quote) => void;
  docName: (id: string) => string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const counts = LABEL_ORDER.map((l) => [l, findings.filter((f) => f.label === l).length] as [Label, number]);
  const sent = sortRfis(rfis);
  const findingBy = new Map(findings.map((f) => [f.assumptionId, f]));
  const unverified = findings.flatMap((f) => f.evidence).filter((e) => !e.quote.verified).length;

  const credit = { signed: pick(range.asSigned, "credit"), low: pick(range.low, "credit"), high: pick(range.high, "credit") };
  const price = { signed: pick(range.asSigned, "price"), low: pick(range.low, "price"), high: pick(range.high, "price") };
  const rate = { signed: pick(range.asSigned, "rate"), low: pick(range.low, "rate"), high: pick(range.high, "rate") };
  const ins = pick(range.high, "insurance");
  const requiredAtHigh = price.high?.current ?? 0; // term sheet: 100% of the purchase price, at the high case
  const insGap = (ins?.current ?? 0) - requiredAtHigh;
  const ifCleared = pick(range.lowIfCleared, "credit");
  const clearNames = range.clearable.map((a) => assumptionName(a)).join(" and ");
  const facts = findings.filter((f) => f.label === "changed").map((f) => assumptionName(f.assumptionId).toLowerCase());

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Report &middot; {dealName}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Does the data room support the term sheet?</h2>

      <div className="mt-6" data-testid="metrics-strip">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Credit amount</div>
            <div className="mt-3 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-slate-500">As signed (term sheet)</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900" data-testid="metric-credit">
                  {credit.signed ? fmtMoney(credit.signed.current) : "–"}
                </div>
              </div>
              <div className="border-slate-200 sm:border-l sm:pl-6">
                <div className="text-xs font-medium text-slate-500">Depending on the seller&apos;s answers</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900" data-testid="metric-credit-range">
                  {credit.low && credit.high ? span(credit.low.current, credit.high.current, "money") : "–"}
                </div>
                {ifCleared && range.clearable.length > 0 && (
                  <div className="mt-1 text-sm text-slate-600" data-testid="metric-credit-if-cleared">
                    Low case {fmtMoney(ifCleared.current)} if {clearNames} is shown. A facility that fails the FEOC rules gets no credit.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Purchase price</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-sm text-slate-400">{price.signed ? fmtMoney(price.signed.current) : ""} signed</span>
              <span className="text-slate-300">&rarr;</span>
              <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900" data-testid="metric-price-range">
                {price.low && price.high ? span(price.low.current, price.high.current, "money") : "–"}
              </span>
            </div>
            {price.signed?.note && <div className="mt-1 text-xs text-slate-500">{price.signed.note}</div>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Credit rate</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-sm text-slate-400">{rate.signed ? fmtMetric(rate.signed.current, "percent") : ""} signed</span>
              <span className="text-slate-300">&rarr;</span>
              <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900" data-testid="metric-rate-range">
                {rate.low && rate.high ? span(rate.low.current, rate.high.current, "percent") : "–"}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">Depends on prevailing wage, the two bonuses and FEOC</div>
          </div>
          {ins && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Insurance limit vs. required</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900" data-testid="metric-insurance">
                  {fmtMetric(ins.current, ins.format)}
                </span>
                <span className="text-sm text-slate-500">bound vs {fmtMoney(requiredAtHigh)} required</span>
              </div>
              <div className={cx("mt-1 text-xs font-medium", insGap < 0 ? "text-red-700" : "text-emerald-700")}>
                {insGap < 0 ? `Shortfall ${fmtMoney(-insGap)}` : `Covers the requirement (+${fmtMoney(insGap)})`} &middot; term sheet requires 100% of the purchase price (high case)
              </div>
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Data room facts{facts.length ? ` (${facts.join(", ")})` : ""} are applied. Each open question could resolve either way, which sets the range. Computed in code, not by the model.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2" data-testid="label-summary">
        <span className="mr-1 text-sm font-medium text-slate-700">{findings.length} checks:</span>
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
          <div>Credit at risk</div>
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
                  return (
                    <li key={f.assumptionId}>
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [f.assumptionId]: !isOpen }))}
                        aria-expanded={isOpen}
                        className={cx("grid w-full gap-2 px-5 py-4 text-left transition hover:bg-slate-50 lg:items-start lg:gap-4", COLS)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cx("mt-0.5 text-slate-400 transition", isOpen && "rotate-90")}>&#9656;</span>
                          <div className="text-sm font-semibold text-slate-900">{assumptionName(f.assumptionId)}</div>
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
                        </div>
                        <div data-testid={`report-risk-${f.assumptionId}`}>
                          <span className="mr-1 text-[11px] uppercase text-slate-400 lg:hidden">Credit at risk: </span>
                          {(() => {
                            const t = creditTag(f, impact, findingBy);
                            return t ? <CreditPill tag={t} wrap /> : <span className="text-sm text-slate-400">–</span>;
                          })()}
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

      {sent.length > 0 && (
        <section className="mt-10" data-testid="report-questions">
          <h3 className="text-lg font-semibold tracking-tight">Questions sent to the seller</h3>
          <ol className="mt-3 space-y-2">
            {sent.map((r, i) => (
              <li key={r.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
                <span className="text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={r.priority} />
                    <CheckTags ids={r.assumptionIds} />
                    {edits[r.id] && <span className="rounded bg-sky-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-sky-800">edited</span>}
                  </div>
                  <div className="mt-1 font-medium text-slate-800">{edits[r.id] ?? r.request}</div>
                  <div className="mt-0.5 text-[13px] text-slate-500">{r.reason}</div>
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
                  <CheckTags ids={k.assumptionIds} />
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

      <footer className="mt-12 border-t border-slate-200 pt-5 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className={cx("font-medium", unverified ? "text-amber-700" : "text-emerald-700")}>
            {unverified ? `${unverified} quotes could not be verified` : "Every quote verified against source text"}
          </span>
          <span data-testid="usage">
            {usage.calls} model calls &middot; {(usage.inputTokens / 1000).toFixed(1)}k input{usage.cacheReadTokens ? ` (${(usage.cacheReadTokens / 1000).toFixed(1)}k from cache)` : ""} / {(usage.outputTokens / 1000).toFixed(1)}k output tokens &middot; ${usage.costUsd.toFixed(2)}
          </span>
          <span>Credit amounts computed in code, not by the model.</span>
        </div>
      </footer>
    </div>
  );
}
