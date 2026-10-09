"use client";
// How we know when Crosscheck is wrong: a real recorded failure and how it was caught, how conclusions move when one
// fact in the documents changes, and what a passing score does not prove. Every model output, score and range here
// is read from recorded eval runs via src/fixtures/reliability.json (scripts/reliability-data.ts; npm test checks it).
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import data from "@/fixtures/reliability.json";
import type { Label } from "@/engine/types";
import type { ViewerTarget } from "./PdfViewer";
import { LabelChip, cx } from "./ui";
import { fmtMoney } from "@/lib/format";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

const REPO = "https://github.com/ferrerap/crosscheck/blob/main/";
const { cottonwood, cleanFirst, cleanAfter, perturbed } = data.runs;
type Run = typeof cleanFirst;
type Ie = typeof data.ie.clean;

const when = (stamp: string) =>
  new Date(stamp).toLocaleString("en-US", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + " UTC";
const range = (r: Run) => (r.range.low.got === r.range.high.got ? fmtMoney(r.range.high.got) : `${fmtMoney(r.range.low.got)} – ${fmtMoney(r.range.high.got)}`);
const passedOf = (rows: { pass: boolean }[]) => `${rows.filter((r) => r.pass).length} of ${rows.length}`;

function Badge({ tone, children }: { tone: "real" | "constructed" | "neutral"; children: ReactNode }) {
  const style = { real: "bg-emerald-50 text-emerald-800 ring-emerald-600/25", constructed: "bg-violet-50 text-violet-800 ring-violet-600/25", neutral: "bg-slate-100 text-slate-700 ring-slate-500/20" }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", style)}>{children}</span>;
}

function Mark({ ok }: { ok: boolean }) {
  return <span className={cx("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{ok ? "✓" : "✕"}</span>;
}

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="mt-2.5 text-sm leading-relaxed text-slate-800">{children}</div>
    </div>
  );
}

/** The engineer's construction-history text with the sentence that matters highlighted. */
function IeText({ ie, onOpen, compact }: { ie: Ie; onOpen: () => void; compact?: boolean }) {
  const text = compact ? ie.key : ie.paragraphs.join(" ");
  const [before, after] = text.split(ie.key);
  return (
    <div>
      <p className="text-[13px] leading-relaxed text-slate-600">
        {before}
        <mark className="rounded bg-amber-100 px-0.5 text-slate-900">{ie.key}</mark>
        {after}
      </p>
      <button onClick={onOpen} className="mt-2 text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">
        Open in the PDF ({ie.title.replace(/:.*/, "")}, p.1)
      </button>
    </div>
  );
}

export default function ReliabilityView() {
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const open = (ie: Ie, room: string) => setViewer({ url: ie.pdf, title: `${ie.title} · ${room}`, highlights: [{ page: 1, text: ie.key, id: "key" }] });
  const firstNote = cleanFirst.findings.T6.summary;
  const cottonwoodRows = cottonwood.rows.filter((r) => !/^range /.test(r.check));
  const perturbedRows = perturbed.rows.filter((r) => !/^range /.test(r.check));

  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
              <rect x="1" y="1" width="20" height="20" rx="5" fill="#0f172a" />
              <path d="M6.5 11.5l3 3 6-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Crosscheck
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">Back to the demo</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Evaluation evidence</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">How do we know when it&apos;s wrong?</h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600">
          Claude reads the documents and code computes the credit, and neither is trusted on its own word. Below: a failure from a real run and
          how it was caught, what happens when one fact in the documents changes, and what a passing score does not prove. Every model
          conclusion, score and range on this page is read from a recorded live run of the full pipeline; the page itself makes no model calls.
        </p>

        {/* The checks, and what each one can and cannot prove. */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Quote verification", "Every quote is string-matched against the PDF's text.", "Proves the citation exists, not that it was read correctly."],
            ["Expected answers, written first", "Per check: label, value, source document, questions, credit range.", "Only as good as the person who wrote them."],
            ["Credit math in code", "The range is recomputed from the model's findings, never taken from the model.", "Correct math on a wrong finding is still wrong."],
            ["Domain review", "The standards behind the expected answers are set by a domain owner.", "Judgment, not proof."],
          ].map(([t, what, limit]) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">{t}</div>
              <div className="mt-1 text-[13px] text-slate-600">{what}</div>
              <div className="mt-2 text-[12px] text-slate-500">Limit: {limit}</div>
            </div>
          ))}
        </div>

        {/* ---------------------------------------------------------------- 1. the failure */}
        <section className="mt-14" data-testid="rel-failure">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">1 · A real failure, and how it was caught</h2>
            <Badge tone="real">Recorded run · clean room · {when(cleanFirst.stamp)} · {cleanFirst.model}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            The clean data room is the same deal with nothing wrong with it. On its first run the pipeline left the construction start open and
            raised a question to the seller. The construction start decides whether the credit is $71.0M or, in the worst case, nothing.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Panel title="What the document says">
              <IeText ie={data.ie.clean} onOpen={() => open(data.ie.clean, "clean room")} />
            </Panel>
            <Panel title="What the system concluded" className="border-red-200">
              <LabelChip label={cleanFirst.findings.T6.label as Label} />
              <p className="mt-2">&ldquo;{firstNote}&rdquo;</p>
              <div className="mt-3 space-y-1 text-[13px]">
                <div><span className="text-slate-500">Question to the seller:</span> {cleanFirst.questions[0]}</div>
                <div><span className="text-slate-500">Credit range (computed from these findings):</span> <b>{range(cleanFirst)}</b></div>
              </div>
            </Panel>
            <Panel title="What it should have concluded" className="border-emerald-200">
              <LabelChip label="confirmed" />
              <p className="mt-2">The engineer says it reviewed the manufacturer&apos;s production records and confirms the date. Expected answer, written before the run: confirmed, no question to the seller.</p>
              <div className="mt-3 text-[13px]"><span className="text-slate-500">Expected credit range:</span> <b>{fmtMoney(cleanFirst.range.low.expected)}</b></div>
              <p className="mt-3 text-[13px] text-slate-600">
                Why it matters: the buyer would have told the seller its credit could be zero and chased records an independent engineer had already reviewed.
              </p>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title="How it was caught" className="lg:col-span-2">
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <Mark ok />
                  <div><b>Quote verification passed: {cleanFirst.quotesVerified} of {cleanFirst.quotes} quotes found in the PDFs.</b> Every citation was real; the reading was still wrong. A source check alone would have let this through.</div>
                </li>
                <li className="flex gap-3">
                  <Mark ok={false} />
                  <div>
                    <b>Expected-versus-actual failed: {cleanFirst.passed} of {cleanFirst.checks} checks.</b>
                    <ul className="mt-1.5 space-y-0.5 font-mono text-[12px] text-slate-600">
                      {cleanFirst.failedRows.map((r) => (
                        <li key={r.check}>{r.check.startsWith("rfis") || r.check.startsWith("risks") ? `${r.check}: got ${r.detail.split(":")[0]}` : `${r.check} · ${r.detail}`}</li>
                      ))}
                    </ul>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Mark ok={false} />
                  <div><b>The credit range, recomputed in code from the findings:</b> low case {fmtMoney(cleanFirst.range.low.got)} against an expected {fmtMoney(cleanFirst.range.low.expected)}.</div>
                </li>
              </ul>
            </Panel>
            <Panel title="Root cause and fix">
              <p>
                Two causes. The rule in force asked for the contract and records themselves and did not say whether an independent engineer&apos;s
                confirmation is enough. And the model wrote that the records &ldquo;have not been provided&rdquo; when the engineer says it reviewed them.
              </p>
              <p className="mt-2">
                The domain owner set the standard, written as a general rule with no special case for this room: an independent party that reviewed the
                records and confirms the date substantiates the start; only the seller&apos;s or supplier&apos;s own word, or an engineer who reviewed nothing, keeps it open.
              </p>
              <div className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex items-center gap-2"><Mark ok /> Clean room re-run: {cleanAfter.passed}/{cleanAfter.checks}, range {range(cleanAfter)}</div>
                <div className="flex items-center gap-2"><Mark ok /> Cottonwood re-run: {cottonwood.passed}/{cottonwood.checks}; its disputed start is still raised</div>
              </div>
            </Panel>
          </div>
        </section>

        {/* ---------------------------------------------------------------- 2. evidence changes */}
        <section className="mt-14" data-testid="rel-change">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">2 · Change one fact, and the conclusion moves</h2>
            <Badge tone="constructed">Constructed scenario · real recorded outputs</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            The perturbed data room is the Cottonwood deal with facts changed on purpose. The one that decides the construction start is a single sentence
            in the independent engineer&apos;s report. Both columns are live runs of the same pipeline, prompts and rules.
          </p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-48 px-4 py-3 font-semibold"></th>
                  <th className="px-4 py-3 font-semibold">Cottonwood · {when(cottonwood.stamp)}</th>
                  <th className="px-4 py-3 font-semibold">Perturbed · {when(perturbed.stamp)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700">The engineer&apos;s report says</td>
                  <td className="px-4 py-3"><IeText compact ie={data.ie.cottonwood} onOpen={() => open(data.ie.cottonwood, "Cottonwood")} /></td>
                  <td className="px-4 py-3"><IeText compact ie={data.ie.perturbed} onOpen={() => open(data.ie.perturbed, "perturbed room")} /></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700">Construction start</td>
                  <td className="px-4 py-3"><LabelChip label={cottonwood.findings.T6.label as Label} /><div className="mt-1.5 text-[13px] text-slate-600">{cottonwood.findings.T6.display}</div></td>
                  <td className="px-4 py-3"><LabelChip label={perturbed.findings.T6.label as Label} /><div className="mt-1.5 text-[13px] text-slate-600">{perturbed.findings.T6.display}</div></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700">Checks that hang on it</td>
                  <td className="px-4 py-3 text-[13px]"><div className="flex flex-wrap items-center gap-2">Domestic content <LabelChip size="sm" label={cottonwood.findings.T5.label as Label} /> FEOC <LabelChip size="sm" label={cottonwood.findings.T8.label as Label} /></div></td>
                  <td className="px-4 py-3 text-[13px]"><div className="flex flex-wrap items-center gap-2">Domestic content <LabelChip size="sm" label={perturbed.findings.T5.label as Label} /> FEOC <LabelChip size="sm" label={perturbed.findings.T8.label as Label} /></div></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700">Question to the seller</td>
                  <td className="px-4 py-3 text-[13px]">{cottonwood.questions[0] ?? "None"}</td>
                  <td className="px-4 py-3 text-[13px]">{perturbed.questions[0] ?? "None"}</td>
                </tr>
                <tr className="bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-700">Credit range<div className="text-[11px] font-normal text-slate-500">computed in code</div></td>
                  <td className="px-4 py-3 text-lg font-semibold text-slate-900">{range(cottonwood)}</td>
                  <td className="px-4 py-3 text-lg font-semibold text-slate-900">{range(perturbed)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-700">Did it respond correctly?<div className="text-[11px] font-normal text-slate-500">eval checks on these rows</div></td>
                  {[[cottonwood, cottonwoodRows], [perturbed, perturbedRows]].map(([run, rows]) => {
                    const r = run as Run;
                    const all = [...(rows as Run["rows"]), ...r.rows.filter((x) => /^range /.test(x.check))];
                    return (
                      <td key={r.room} className="px-4 py-3">
                        <div className="mb-1.5 text-[13px] font-semibold text-slate-800">{passedOf(all)} passed</div>
                        <ul className="space-y-0.5 font-mono text-[11.5px] text-slate-600">
                          {all.map((x) => (
                            <li key={x.check} className="flex items-center gap-1.5"><span className={x.pass ? "text-emerald-600" : "text-red-600"}>{x.pass ? "✓" : "✕"}</span>{x.check}</li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">
            The perturbed room also resolves the apprenticeship and insurance facts. The basis cut ($142.0M to $136.4M) is in both rooms, which is why the top of
            both ranges is $68.2M rather than $71.0M. With the start confirmed in 2025, the FEOC rules no longer apply and the zero-credit case disappears.
          </p>
        </section>

        {/* ---------------------------------------------------------------- 3. limits */}
        <section className="mt-14" data-testid="rel-limits">
          <h2 className="text-xl font-semibold text-slate-900">3 · What a passing score does not prove</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Panel title={`A miss left on the record · perturbed ${perturbed.passed}/${perturbed.checks}`}>
              <p className="font-mono text-[12px] text-red-700">✕ {perturbed.failedRows[0].check}</p>
              <p className="mt-2">
                The expected answers assumed the schedule slip to 2027 would be repeated as a risk. The run reported it in the placed-in-service finding instead and
                raised a different risk. Arguably the expected answer is wrong, but it was not edited after seeing the output: that would turn the eval into a description of the model.
              </p>
            </Panel>
            <Panel title="A pass that still needed judgment · clean room">
              <p className="font-medium">&ldquo;{cleanAfter.risks[0].title}&rdquo;</p>
              <p className="mt-2">
                The clean room allows at most one risk, so this passes. Whether it is a real risk or noise is a tax judgment, not something the score can decide; the domain
                reviewer judged it legitimate.
              </p>
            </Panel>
            <Panel title="What the numbers do and do not show">
              <p>
                The expected answers were written in advance by the people who planted the issues (drafted with Claude, reviewed by the domain owner), and each new
                room has one recorded run. The scores show the pipeline
                executes its rules reliably and changes its conclusions when the evidence changes. They do not show it would read an unseen deal correctly.
              </p>
            </Panel>
          </div>
        </section>

        <footer className="mt-14 border-t border-slate-200 pt-5 text-[12px] text-slate-500">
          Recorded runs behind this page:{" "}
          {[cottonwood, cleanFirst, cleanAfter, perturbed].map((r, i) => (
            <span key={r.file}>
              {i > 0 && " · "}
              <a className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800" href={REPO + r.file} target="_blank" rel="noopener noreferrer">
                {r.room} {r.stamp.slice(11, 16)}
              </a>{" "}
              ({r.passed}/{r.checks}, ${r.costUsd.toFixed(2)})
            </span>
          ))}
          . Data extracted by <a className="underline decoration-slate-300 underline-offset-2" href={REPO + "scripts/reliability-data.ts"} target="_blank" rel="noopener noreferrer">scripts/reliability-data.ts</a>; <code>npm test</code> fails if this page drifts from those files.
        </footer>
      </main>

      <PdfViewer target={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}
