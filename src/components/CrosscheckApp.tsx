"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaselineAssumption, DocClassification, Evidence, Finding, Gap, Question, Quote, Rfi, Risk, RunUsage } from "@/engine/types";
import type { Values } from "@/playbooks/types";
import { activePlaybook } from "@/lib/activePlaybook";
import { creditAtRisk, creditCutByFacts, creditRange, type CreditImpact } from "@/lib/scenarios";
import { readerRisks, sendableRfis } from "@/lib/questions";
import { docLabels } from "@/lib/meta";
import { ZERO_USAGE, addUsage, fileUrl, makeRunner, type DocMeta, type Runner, type RunnerMode } from "@/lib/runner";
import { cx } from "./ui";
import type { ViewerTarget } from "./PdfViewer";
import { UploadStep } from "./UploadStep";
import { BaselineStep } from "./BaselineStep";
import { CheckStep, type ScanPhase } from "./CheckStep";
import { ReportStep } from "./ReportStep";

const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

type Step = "upload" | "baseline" | "check" | "report";
const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "baseline", label: "Baseline" },
  { id: "check", label: "Cross-check and review" },
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
  const [accepted, setAccepted] = useState<Set<string>>(new Set()); // questions to the seller that will be sent
  const [edits, setEdits] = useState<Record<string, string>>({}); // reworded questions, by RFI id
  const [toast, setToast] = useState<string | null>(null);
  const [usage, setUsage] = useState<RunUsage>(ZERO_USAGE);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const clsById = useMemo(() => new Map(classifications.map((c) => [c.docId, c])), [classifications]);
  const labels = useMemo(() => docLabels(classifications), [classifications]);
  const docName = useCallback((id: string) => labels.get(id) ?? docById.get(id)?.filename ?? id, [labels, docById]);

  /** Opens the drawer on the first quote's document with every quote of that document highlighted. */
  const openQuotes = useCallback(
    (quotes: Quote[]) => {
      const d = docById.get(quotes[0]?.docId);
      if (!d) return;
      const same = quotes.filter((q) => q.docId === d.id);
      setViewer({
        url: fileUrl(d.filename, serverRunId),
        title: clsById.get(d.id)?.title ?? d.filename,
        highlights: same.map((q, i) => ({ page: q.page, text: q.text, id: `q${i}` })),
      });
    },
    [docById, clsById, serverRunId],
  );
  const openQuote = useCallback((q: Quote) => openQuotes([q]), [openQuotes]);
  const closeViewer = useCallback(() => setViewer(null), []);

  // ---- credit range across the ways the open questions could resolve ----
  const baselineValues: Values = useMemo(() => Object.fromEntries(baseline.map((b) => [b.id, b.value])), [baseline]);
  const range = useMemo(
    () => (baseline.length && findings.length ? creditRange(activePlaybook, baselineValues, findings, questions, evidence) : null),
    [baseline, baselineValues, findings, questions, evidence],
  );
  const impact: CreditImpact = useMemo(
    () =>
      baseline.length && findings.length
        ? {
            atRisk: creditAtRisk(activePlaybook, baselineValues, findings, questions, evidence),
            cut: creditCutByFacts(activePlaybook, baselineValues, findings, questions, evidence),
          }
        : { atRisk: {}, cut: {} },
    [baseline, baselineValues, findings, questions, evidence],
  );
  const sentRfis = useMemo(() => sendableRfis(rfis, findings, accepted), [rfis, findings, accepted]);
  const shownRisks = useMemo(() => readerRisks(risks, classifications), [risks, classifications]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

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
    setAccepted(new Set());
    setEdits({});
    setToast(null);
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
    setStep("check");
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
      setAccepted(new Set((r.rfis ?? []).map((x) => x.id)));
      setEdits({});
      setUsage((u) => addUsage(u, r.usage));
      setPhase("done");
    } catch (e) {
      fail(e);
    }
  };

  const anchor = docs.find((d) => d.role === "anchor");
  const wide = step === "baseline" || step === "check";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header step={step} runMode={runMode} wide={wide} onReset={reset} />
      <main className={cx("mx-auto w-full flex-1 px-4 pt-8 sm:px-6", step === "check" ? "pb-8" : "pb-20", wide ? "max-w-[1400px]" : "max-w-6xl")}>
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

        {step === "check" && (
          <CheckStep
            docs={docs}
            baseline={baseline}
            classifications={classifications}
            phase={phase}
            evidence={evidence}
            gaps={gaps}
            findings={findings}
            questions={questions}
            rfis={rfis}
            risks={shownRisks}
            impact={impact}
            accepted={accepted}
            edits={edits}
            onAccept={(id, on) =>
              setAccepted((s) => {
                const n = new Set(s);
                if (on) n.add(id);
                else n.delete(id);
                return n;
              })
            }
            onEdit={(id, text) =>
              setEdits((e) => {
                const n = { ...e };
                if (text === null) delete n[id];
                else n[id] = text;
                return n;
              })
            }
            onOpenQuotes={openQuotes}
            onSend={() => {
              setToast("Questions ready to send. Nothing was sent in this demo.");
              setStep("report");
            }}
          />
        )}

        {step === "report" && range && (
          <ReportStep
            range={range}
            impact={impact}
            findings={findings}
            rfis={sentRfis}
            edits={edits}
            risks={shownRisks}
            usage={usage}
            onOpen={openQuote}
            docName={docName}
          />
        )}
      </main>
      <PdfViewer target={viewer} onClose={closeViewer} />
      {toast && (
        <div role="status" data-testid="toast" className="fixed bottom-7 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-[13px] text-white shadow-xl">
          {toast}
        </div>
      )}
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
