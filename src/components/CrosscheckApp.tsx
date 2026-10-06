"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaselineAssumption, DocClassification, Evidence, Finding, Gap, Question, Quote, Rfi, Risk, RunUsage } from "@/engine/types";
import type { Values } from "@/playbooks/types";
import { itcTransfer } from "@/playbooks/itc-transfer";
import { humanize } from "@/lib/meta";
import { ZERO_USAGE, addUsage, fileUrl, makeRunner, type DocMeta, type Runner, type RunnerMode } from "@/lib/runner";
import { cx } from "./ui";
import type { ViewerTarget } from "./PdfViewer";
import { UploadStep } from "./UploadStep";
import { BaselineStep } from "./BaselineStep";
import { ScanStep, type ScanPhase } from "./ScanStep";
import { ReviewStep } from "./ReviewStep";
import { ReportStep } from "./ReportStep";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

type Step = "upload" | "baseline" | "scan" | "review" | "report";
const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "baseline", label: "Baseline" },
  { id: "scan", label: "Cross-check" },
  { id: "review", label: "Review" },
  { id: "report", label: "Report" },
];

export default function CrosscheckApp() {
  const [step, setStep] = useState<Step>("upload");
  const [runMode, setRunMode] = useState<RunnerMode | null>(null);
  const [serverRunId, setServerRunId] = useState<string | null>(null); // set when the user's own files were uploaded
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [baseline, setBaseline] = useState<BaselineAssumption[]>([]);
  const [classifications, setClassifications] = useState<DocClassification[]>([]);
  const [phase, setPhase] = useState<ScanPhase>("classifying");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rfis, setRfis] = useState<Rfi[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<RunUsage>(ZERO_USAGE);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const clsById = useMemo(() => new Map(classifications.map((c) => [c.docId, c])), [classifications]);
  const docName = useCallback(
    (id: string) => {
      const t = clsById.get(id)?.docType;
      return t ? humanize(t) : (docById.get(id)?.filename ?? id);
    },
    [clsById, docById],
  );

  /** Opens the drawer on the first quote's document with every quote of that document highlighted. */
  const openQuotes = useCallback(
    (quotes: Quote[]) => {
      const d = docById.get(quotes[0]?.docId);
      if (!d) return;
      const same = quotes.filter((q) => q.docId === d.id);
      setViewer({
        url: fileUrl(d.filename, serverRunId),
        title: `${d.id} · ${clsById.get(d.id)?.title ?? d.filename}`,
        highlights: same.map((q, i) => ({ page: q.page, text: q.text, id: `q${i}` })),
      });
    },
    [docById, clsById, serverRunId],
  );
  const openQuote = useCallback((q: Quote) => openQuotes([q]), [openQuotes]);
  const closeViewer = useCallback(() => setViewer(null), []);

  // ---- live metrics ----
  const baselineValues: Values = useMemo(() => Object.fromEntries(baseline.map((b) => [b.id, b.value])), [baseline]);
  const currentValues: Values = useMemo(() => {
    const v: Values = {};
    // Assumptions tied to an unanswered judgment call stay at term-sheet values until the user decides.
    const undecided = new Set(questions.filter((q) => !answers[q.id]).flatMap((q) => q.assumptionIds));
    for (const f of findings)
      if (f.currentValue !== undefined && f.currentValue !== null && !undecided.has(f.assumptionId)) v[f.assumptionId] = f.currentValue;
    for (const q of questions) {
      const opt = q.options.find((o) => o.id === answers[q.id]);
      if (opt) Object.assign(v, opt.sets);
    }
    return v;
  }, [findings, questions, answers]);
  const metrics = useMemo(() => (baseline.length ? itcTransfer.metrics(baselineValues, currentValues) : []), [baseline, baselineValues, currentValues]);

  // ---- flow ----
  const reset = () => {
    gen.current++;
    setStep("upload");
    setRunMode(null);
    setServerRunId(null);
    setBusy(null);
    setError(null);
    setDocs([]);
    setBaseline([]);
    setClassifications([]);
    setEvidence([]);
    setGaps([]);
    setFindings([]);
    setQuestions([]);
    setRfis([]);
    setRisks([]);
    setAnswers({});
    setUsage(ZERO_USAGE);
    setPhase("classifying");
    setViewer(null);
  };

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setBusy(null);
  };

  const begin = async (mode: RunnerMode, uploadId: string | null, message: string) => {
    const my = gen.current;
    setRunMode(mode);
    setServerRunId(uploadId);
    setBusy(message);
    try {
      const r = await makeRunner(mode, uploadId ?? undefined).extractBaseline();
      if (my !== gen.current) return;
      setDocs(r.docs);
      setBaseline(r.baseline);
      setUsage(r.usage);
      setBusy(null);
      setStep("baseline");
    } catch (e) {
      fail(e);
    }
  };

  const startDemo = (mode: RunnerMode) => {
    gen.current++;
    setError(null);
    return begin(mode, null, mode === "replay" ? "Reading the term sheet and extracting assumptions..." : "Claude is reading the term sheet...");
  };

  const startUpload = async (termSheet: File, dataRoom: File[]) => {
    gen.current++;
    const my = gen.current;
    setError(null);
    setBusy("Uploading documents...");
    try {
      const form = new FormData();
      form.append("termSheet", termSheet);
      for (const f of dataRoom) form.append("dataRoom", f);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.runId) throw new Error(json.error ?? `Upload failed (${res.status}).`);
      if (my !== gen.current) return;
      await begin("live", json.runId as string, "Claude is reading the term sheet...");
    } catch (e) {
      fail(e);
    }
  };

  const confirmBaseline = async () => {
    const my = gen.current;
    const runner: Runner = makeRunner(runMode ?? "replay", serverRunId ?? undefined);
    setStep("scan");
    setPhase("classifying");
    setClassifications([]);
    setError(null);
    try {
      const c = await runner.classifyDocs({ docs, baseline }, (item) => {
        if (my !== gen.current) return;
        setClassifications((prev) => [...prev, item]);
      });
      if (my !== gen.current) return;
      const cls = c.classifications;
      setUsage((u) => addUsage(u, c.usage));
      setPhase("evidence");
      const e = await runner.gatherEvidence({ baseline, classifications: cls });
      if (my !== gen.current) return;
      setEvidence(e.evidence);
      setGaps(e.gaps ?? []);
      setUsage((u) => addUsage(u, e.usage));
      setPhase("reconcile");
      const r = await runner.reconcile({ baseline, classifications: cls, evidence: e.evidence });
      if (my !== gen.current) return;
      setFindings(r.findings);
      setQuestions(r.questions);
      setRfis(r.rfis ?? []);
      setRisks(r.risks ?? []);
      setUsage((u) => addUsage(u, r.usage));
      setPhase("done");
    } catch (e) {
      fail(e);
    }
  };

  const allAnswered = questions.every((q) => answers[q.id]);
  const anchor = docs.find((d) => d.role === "anchor");
  const wide = step === "baseline" || step === "scan";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header step={step} runMode={runMode} wide={wide} onReset={reset} />
      <main className={cx("mx-auto w-full flex-1 px-4 pb-20 pt-8 sm:px-6", wide ? "max-w-[1400px]" : "max-w-6xl")}>
        {error && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <span>{error}</span>
            <button className="shrink-0 font-semibold underline" onClick={reset}>
              Start over
            </button>
          </div>
        )}

        {step === "upload" && (
          <UploadStep busy={busy} onReplay={() => startDemo("replay")} onLiveDemo={() => startDemo("live")} onLiveUpload={startUpload} />
        )}

        {step === "baseline" && (
          <BaselineStep
            baseline={baseline}
            termSheetName={anchor?.filename ?? "the term sheet"}
            termSheetUrl={anchor ? fileUrl(anchor.filename, serverRunId) : ""}
            onConfirm={confirmBaseline}
          />
        )}

        {step === "scan" && (
          <ScanStep
            docs={docs}
            baseline={baseline}
            classifications={classifications}
            phase={phase}
            evidence={evidence}
            gaps={gaps}
            findings={findings}
            reviewCount={questions.length}
            onOpenQuotes={openQuotes}
            onContinue={() => setStep("review")}
          />
        )}

        {step === "review" && (
          <ReviewStep
            metrics={metrics}
            questions={questions}
            answers={answers}
            rfis={rfis}
            risks={risks}
            allAnswered={allAnswered}
            onAnswer={(qid, oid) => setAnswers((a) => ({ ...a, [qid]: oid }))}
            onOpen={openQuote}
            onBuild={() => setStep("report")}
            docName={docName}
          />
        )}

        {step === "report" && (
          <ReportStep
            metrics={metrics}
            findings={findings}
            questions={questions}
            answers={answers}
            rfis={rfis}
            risks={risks}
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

function Header({ step, runMode, wide, onReset }: { step: Step; runMode: RunnerMode | null; wide: boolean; onReset: () => void }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className={cx("mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:px-6", wide ? "max-w-[1400px]" : "max-w-6xl")}>
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

        <div className="flex w-28 justify-end">
          {runMode && (
            <span
              data-testid="run-badge"
              className={cx(
                "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                runMode === "replay" ? "bg-slate-100 text-slate-700 ring-slate-500/20" : "bg-emerald-50 text-emerald-800 ring-emerald-600/25",
              )}
            >
              {runMode === "replay" ? "Recorded run" : "● Live"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
