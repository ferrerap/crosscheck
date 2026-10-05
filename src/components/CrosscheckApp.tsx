"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BaselineAssumption,
  DocClassification,
  Evidence,
  Finding,
  Label,
  Question,
  Quote,
  RunUsage,
} from "@/engine/types";
import type { Values } from "@/playbooks/types";
import { itcTransfer } from "@/playbooks/itc-transfer";
import { LABEL_ORDER, fmtMoney } from "@/lib/format";
import { ZERO_USAGE, addUsage, makeRunner, type DocMeta, type Runner, type RunnerMode } from "@/lib/runner";
import { Card, LabelChip, MetricsStrip, PrimaryButton, QuoteChip, Spinner, StanceTag, cx } from "./ui";
import type { ViewerTarget } from "./PdfViewer";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

type Step = "start" | "baseline" | "scan" | "questions" | "report";
const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "baseline", label: "Baseline" },
  { id: "scan", label: "Data room" },
  { id: "questions", label: "Questions" },
  { id: "report", label: "Report" },
];
const DEMO_BASE = "/demo-data/itc-transfer/";
const assumptionName = (id: string) => itcTransfer.assumptions.find((a) => a.id === id)?.name ?? id;

const MATCH_BADGE: Record<string, { text: string; cls: string }> = {
  match: { text: "Project match", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  different_project: { text: "Different project", cls: "bg-red-50 text-red-800 ring-red-600/20" },
  general_reference: { text: "General reference", cls: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  unclear: { text: "Project unclear", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
};
/** "cost_segregation_report" → "Cost segregation report" */
const humanize = (t: string) => { const s = t.replace(/[_-]+/g, " ").trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

const isInjection = (c: DocClassification) =>
  !!c.suspiciousInstructions || /embedded instruction|prompt injection|addressed to automated|aimed at automated/i.test(c.summary);

export default function CrosscheckApp() {
  const [mode, setMode] = useState<RunnerMode>("replay");
  const [step, setStep] = useState<Step>("start");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [baseline, setBaseline] = useState<BaselineAssumption[]>([]);
  const [classifications, setClassifications] = useState<DocClassification[]>([]);
  const [phase, setPhase] = useState<"classifying" | "evidence" | "reconcile" | "done">("classifying");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<RunUsage>(ZERO_USAGE);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const clsById = useMemo(() => new Map(classifications.map((c) => [c.docId, c])), [classifications]);
  const docName = useCallback((id: string) => { const t = clsById.get(id)?.docType; return t ? humanize(t) : docById.get(id)?.filename ?? id; }, [clsById, docById]);

  const openQuote = useCallback(
    (q: Quote) => {
      const d = docById.get(q.docId);
      if (!d) return;
      setViewer({
        url: DEMO_BASE + d.filename,
        title: `${q.docId} · ${clsById.get(q.docId)?.title ?? d.filename}`,
        page: q.page,
        quote: q.text,
      });
    },
    [docById, clsById],
  );
  const closeViewer = useCallback(() => setViewer(null), []);

  // ---- live metrics ----
  const baselineValues: Values = useMemo(() => Object.fromEntries(baseline.map((b) => [b.id, b.value])), [baseline]);
  const currentValues: Values = useMemo(() => {
    const v: Values = {};
    // Assumptions tied to an unanswered question stay at term-sheet values until the user decides.
    const undecided = new Set(questions.filter((q) => !answers[q.id]).flatMap((q) => q.assumptionIds));
    for (const f of findings)
      if (f.currentValue !== undefined && f.currentValue !== null && !undecided.has(f.assumptionId)) v[f.assumptionId] = f.currentValue;
    for (const q of questions) {
      const opt = q.options.find((o) => o.id === answers[q.id]);
      if (opt) Object.assign(v, opt.sets);
    }
    return v;
  }, [findings, questions, answers]);
  const metrics = useMemo(
    () => (baseline.length ? itcTransfer.metrics(baselineValues, currentValues) : []),
    [baseline, baselineValues, currentValues],
  );

  // ---- flow ----
  const reset = () => {
    runId.current++;
    setStep("start");
    setBusy(null);
    setError(null);
    setDocs([]);
    setBaseline([]);
    setClassifications([]);
    setEvidence([]);
    setFindings([]);
    setQuestions([]);
    setAnswers({});
    setUsage(ZERO_USAGE);
    setPhase("classifying");
    setViewer(null);
  };

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setBusy(null);
  };

  const startDemo = async () => {
    const my = ++runId.current;
    setError(null);
    setBusy("Reading the term sheet and extracting assumptions...");
    try {
      const r = await makeRunner(mode).extractBaseline();
      if (my !== runId.current) return;
      setDocs(r.docs);
      setBaseline(r.baseline);
      setUsage(r.usage);
      setBusy(null);
      setStep("baseline");
    } catch (e) {
      fail(e);
    }
  };

  const confirmBaseline = async () => {
    const my = runId.current;
    const runner: Runner = makeRunner(mode);
    setStep("scan");
    setPhase("classifying");
    setClassifications([]);
    setError(null);
    try {
      let cls: DocClassification[] = [];
      const c = await runner.classifyDocs({ docs, baseline }, (item) => {
        if (my !== runId.current) return;
        setClassifications((prev) => [...prev, item]);
      });
      if (my !== runId.current) return;
      cls = c.classifications;
      setUsage((u) => addUsage(u, c.usage));
      setPhase("evidence");
      const e = await runner.gatherEvidence({ baseline, classifications: cls });
      if (my !== runId.current) return;
      setEvidence(e.evidence);
      setUsage((u) => addUsage(u, e.usage));
      setPhase("reconcile");
      const r = await runner.reconcile({ baseline, classifications: cls, evidence: e.evidence });
      if (my !== runId.current) return;
      setFindings(r.findings);
      setQuestions(r.questions);
      setUsage((u) => addUsage(u, r.usage));
      setPhase("done");
    } catch (e) {
      fail(e);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header step={step} mode={mode} setMode={setMode} locked={step !== "start" || !!busy} onReset={reset} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
        {error && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <span>{error}</span>
            <button className="shrink-0 font-semibold underline" onClick={reset}>
              Start over
            </button>
          </div>
        )}

        {step === "start" && <StartScreen busy={busy} mode={mode} onStart={startDemo} />}

        {step === "baseline" && (
          <BaselineStep baseline={baseline} docs={docs} onOpen={openQuote} onConfirm={confirmBaseline} docName={docName} />
        )}

        {step === "scan" && (
          <ScanStep
            docs={docs}
            classifications={classifications}
            phase={phase}
            evidenceCount={evidence.length}
            questionCount={questions.length}
            onContinue={() => setStep(questions.length ? "questions" : "report")}
          />
        )}

        {step === "questions" && (
          <div>
            <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
              <MetricsStrip metrics={metrics} pending={!allAnswered} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Two decisions need your judgment</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              The documents conflict or a human call is needed. Pick an option and the headline numbers above recompute immediately.
            </p>
            <div className="mt-6 space-y-6">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  answer={answers[q.id]}
                  onAnswer={(oid) => setAnswers((a) => ({ ...a, [q.id]: oid }))}
                  onOpen={openQuote}
                  docName={docName}
                />
              ))}
            </div>
            <div className="mt-8 flex items-center justify-end gap-3">
              {!allAnswered && <span className="text-sm text-slate-500">Answer every question to build the report.</span>}
              <PrimaryButton disabled={!allAnswered} onClick={() => setStep("report")}>
                Build report
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "report" && (
          <ReportStep
            metrics={metrics}
            findings={findings}
            questions={questions}
            answers={answers}
            usage={usage}
            onOpen={openQuote}
            docName={docName}
          />
        )}
      </main>
      <PdfViewer target={viewer} onClose={closeViewer} />
    </div>
  );
}

// ---------------------------------------------------------------- header

function Header({
  step,
  mode,
  setMode,
  locked,
  onReset,
}: {
  step: Step;
  mode: RunnerMode;
  setMode: (m: RunnerMode) => void;
  locked: boolean;
  onReset: () => void;
}) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <button onClick={onReset} className="flex items-center gap-2" aria-label="Crosscheck home">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <rect x="1" y="1" width="20" height="20" rx="5" fill="#0f172a" />
            <path d="M6 11.5l3.2 3.2L16 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight">Crosscheck</span>
        </button>

        <ol className="hidden items-center gap-1 md:flex" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1">
              <span
                className={cx(
                  "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
                  i === idx ? "bg-slate-900 text-white" : i < idx ? "text-slate-700" : "text-slate-400",
                )}
                aria-current={i === idx ? "step" : undefined}
              >
                <span
                  className={cx(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                    i === idx ? "bg-white text-slate-900" : i < idx ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500",
                  )}
                >
                  {i < idx ? "✓" : i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-slate-200" />}
            </li>
          ))}
        </ol>
        <span className="text-xs font-medium text-slate-500 md:hidden">
          {idx + 1}/{STEPS.length} {STEPS[idx].label}
        </span>

        <div
          className={cx("flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium", locked && "opacity-60")}
          role="radiogroup"
          aria-label="Run mode"
          title={locked ? "Start over to change mode" : undefined}
        >
          {(
            [
              ["replay", "Demo replay"],
              ["live", "Live (Claude API)"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              disabled={locked}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-md px-3 py-1.5 transition disabled:cursor-not-allowed",
                mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- start

function StartScreen({ busy, mode, onStart }: { busy: string | null; mode: RunnerMode; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-3xl pt-8 sm:pt-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{itcTransfer.name}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
        Does the data room support the term sheet?
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
        Crosscheck reads the buyer&apos;s term sheet, scans the seller&apos;s data room, and tests each assumption behind the credit amount
        against verbatim, clickable evidence. Where documents disagree, it asks you to decide.
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        <PrimaryButton onClick={onStart} disabled={!!busy} className="px-6 py-3 text-base">
          {busy ? <Spinner className="border-slate-500 border-t-white" /> : null}
          Load demo deal: Cottonwood Solar I
        </PrimaryButton>
        <span className="text-sm text-slate-500">
          {mode === "replay" ? "Recorded run, no API calls." : "Calls the Claude API through this app's server routes."}
        </span>
      </div>
      {busy && <p className="mt-4 text-sm text-slate-600">{busy}</p>}

      <div className="mt-12 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center">
        <div className="text-sm font-medium text-slate-700">Drop a term sheet and data room PDFs here</div>
        <div className="mt-1 text-xs text-slate-500">
          Upload is not wired up yet. The demo deal runs on a bundled data room: 12 synthetic documents (fictional parties) plus 4 excerpts of real public IRS and county documents.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- baseline

function BaselineStep({
  baseline,
  docs,
  onOpen,
  onConfirm,
  docName,
}: {
  baseline: BaselineAssumption[];
  docs: DocMeta[];
  onOpen: (q: Quote) => void;
  onConfirm: () => void;
  docName: (id: string) => string;
}) {
  const anchor = docs.find((d) => d.role === "anchor");
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Baseline: what the term sheet assumes</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Extracted from <span className="font-medium text-slate-800">{anchor?.filename ?? "the term sheet"}</span>. Click a source chip to see
        the passage in the PDF. Confirm the baseline before the data room is scanned against it.
      </p>
      <Card className="mt-6 overflow-hidden">
        <div className="hidden grid-cols-[2.5rem_14rem_16rem_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
          <div>ID</div>
          <div>Assumption</div>
          <div>Term sheet value</div>
          <div>Source</div>
        </div>
        <ul className="divide-y divide-slate-100">
          {baseline.map((b) => (
            <li key={b.id} className="grid gap-1 px-5 py-3.5 md:grid-cols-[2.5rem_14rem_16rem_1fr] md:items-center md:gap-4">
              <div className="font-mono text-xs font-semibold text-slate-400">{b.id}</div>
              <div className="text-sm font-medium text-slate-900">{assumptionName(b.id)}</div>
              <div className="text-sm text-slate-800">{b.display}</div>
              <div className="min-w-0">
                {b.quote ? <QuoteChip quote={b.quote} docName={docName(b.quote.docId)} onOpen={onOpen} /> : <span className="text-xs text-slate-400">Not found</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-6 flex justify-end">
        <PrimaryButton onClick={onConfirm}>Confirm baseline</PrimaryButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- scan

function ScanStep({
  docs,
  classifications,
  phase,
  evidenceCount,
  questionCount,
  onContinue,
}: {
  docs: DocMeta[];
  classifications: DocClassification[];
  phase: "classifying" | "evidence" | "reconcile" | "done";
  evidenceCount: number;
  questionCount: number;
  onContinue: () => void;
}) {
  const byId = new Map(classifications.map((c) => [c.docId, c]));
  const done = classifications.length;
  const status =
    phase === "classifying"
      ? `Classifying documents (${done} of ${docs.length})...`
      : phase === "evidence"
        ? "Gathering evidence and verifying quotes against source text..."
        : phase === "reconcile"
          ? "Reconciling evidence against the baseline..."
          : `Done. ${evidenceCount} evidence quotes verified, ${questionCount} questions for you.`;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Scanning the data room</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-600" data-testid="scan-status">
            {phase !== "done" && <Spinner />}
            {status}
          </p>
        </div>
        <PrimaryButton disabled={phase !== "done"} onClick={onContinue}>
          {questionCount ? `Continue to ${questionCount} questions` : "Continue to report"}
        </PrimaryButton>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-500"
          style={{ width: `${phase === "classifying" ? (done / docs.length) * 60 : phase === "evidence" ? 80 : phase === "reconcile" ? 92 : 100}%` }}
        />
      </div>
      <ul className="mt-6 space-y-2.5">
        {docs.map((d) => {
          const c = byId.get(d.id);
          const next = !c && classifications.length === docs.findIndex((x) => x.id === d.id);
          if (!c) {
            return (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/50 px-4 py-3 text-sm text-slate-400">
                <span className="font-mono text-xs">{d.id}</span>
                <span className="truncate">{d.filename}</span>
                <span className="ml-auto flex items-center gap-2 text-xs">{next && phase === "classifying" ? <><Spinner /> Reading...</> : "Queued"}</span>
              </li>
            );
          }
          const badge = MATCH_BADGE[c.projectMatch];
          const inj = isInjection(c);
          const flagged = inj || c.projectMatch !== "match";
          return (
            <li
              key={d.id}
              className={cx(
                "fade-in rounded-xl border bg-white px-4 py-3.5 shadow-sm",
                flagged ? "border-red-300 ring-1 ring-red-100" : "border-slate-200",
              )}
              data-testid={`doc-${d.id}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-mono text-xs font-semibold text-slate-400">{d.id}</span>
                <span className="text-sm font-semibold text-slate-900">{humanize(c.docType)}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", badge.cls)}>{badge.text}</span>
                {inj && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Embedded instruction ignored
                  </span>
                )}
                <span className="ml-auto flex flex-wrap gap-1">
                  {c.relevantAssumptions.map((a) => (
                    <span key={a} title={assumptionName(a)} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                      {a}
                    </span>
                  ))}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.summary}</p>
              <div className="mt-1 truncate text-xs text-slate-400">{d.filename}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- questions

function QuestionCard({
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
    <Card className="p-6" >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Question {index + 1}</span>
        <span className="text-slate-300">/</span>
        {q.assumptionIds.map((a) => (
          <span key={a} title={assumptionName(a)} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono normal-case text-slate-700">
            {a}
          </span>
        ))}
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
              className={cx(
                "rounded-lg border p-4 text-left transition",
                sel ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white hover:border-slate-400",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cx(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    sel ? "border-white" : "border-slate-300",
                  )}
                >
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

// ---------------------------------------------------------------- report

function ReportStep({
  metrics,
  findings,
  questions,
  answers,
  usage,
  onOpen,
  docName,
}: {
  metrics: ReturnType<typeof itcTransfer.metrics>;
  findings: Finding[];
  questions: Question[];
  answers: Record<string, string>;
  usage: RunUsage;
  onOpen: (q: Quote) => void;
  docName: (id: string) => string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const counts = LABEL_ORDER.map((l) => [l, findings.filter((f) => f.label === l).length] as [Label, number]);
  const followUps = findings.filter((f) => f.followUp);
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
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{itcTransfer.question}</h2>

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
        <div className="hidden grid-cols-[13rem_7.5rem_11rem_13rem_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <div>Assumption</div>
          <div>Status</div>
          <div>Term sheet</div>
          <div>Current</div>
          <div>Why</div>
        </div>
        <ul className="divide-y divide-slate-100">
          {findings.map((f) => {
            const isOpen = !!open[f.assumptionId];
            const decision = decisionFor(f);
            return (
              <li key={f.assumptionId}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, [f.assumptionId]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="grid w-full gap-2 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[13rem_7.5rem_11rem_13rem_1fr] lg:items-start lg:gap-4"
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
      </Card>

      {followUps.length > 0 && (
        <section className="mt-10">
          <h3 className="text-lg font-semibold tracking-tight">Follow-up requests to the seller</h3>
          <ol className="mt-3 space-y-2">
            {followUps.map((f, i) => (
              <li key={f.assumptionId} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
                <span className="font-mono text-xs font-semibold text-slate-400">{i + 1}</span>
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    {f.assumptionId} &middot; {assumptionName(f.assumptionId)}
                  </div>
                  <div className="mt-0.5 text-slate-800">{f.followUp}</div>
                </div>
              </li>
            ))}
          </ol>
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
            {usage.calls} model calls &middot; {(usage.inputTokens / 1000).toFixed(1)}k input / {(usage.outputTokens / 1000).toFixed(1)}k output
            tokens &middot; ${usage.costUsd.toFixed(2)}
          </span>
          <span>Credit amount {fmtMoney(metrics.find((m) => m.id === "credit")?.current ?? 0)} computed in code, not by the model.</span>
        </div>
      </footer>
    </div>
  );
}
