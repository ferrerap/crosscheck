"use client";
// Cross-check and review (design G4): checks as collapsed rows, every open check is a question to the seller.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BaselineAssumption, DocClassification, Evidence, Finding, Gap, Label, Quote, Question, Rfi, Risk } from "@/engine/types";
import { assumptionName, docLabels, isInjectedEvidence, shortType } from "@/lib/meta";
import type { DocMeta } from "@/lib/runner";
import { Card, LabelChip, PriorityBadge, PrimaryButton, SourceTag, Spinner, cx, sortRfis } from "./ui";
import { QuestionDrawer } from "./QuestionDrawer";
import { SendModal } from "./SendModal";

export type ScanPhase = "classifying" | "evidence" | "reconcile" | "done";

const MATCH_BADGE: Record<string, { text: string; cls: string }> = {
  match: { text: "Match", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  different_project: { text: "Different project", cls: "bg-red-50 text-red-800 ring-red-600/25" },
  general_reference: { text: "General reference", cls: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  unclear: { text: "Unclear", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
};

const SEVERITY: Record<Label, number> = { conflicting: 0, contradicted: 1, changed: 2, unverified: 3, confirmed: 4 };
// Mark colours: a disagreement takes the colour of the check's result.
const MARK_CON: Record<Label, string> = {
  confirmed: "bg-amber-100 text-amber-800",
  changed: "bg-amber-100 text-amber-800",
  contradicted: "bg-red-100 text-red-800",
  conflicting: "bg-purple-100 text-purple-800",
  unverified: "bg-slate-200 text-slate-700",
};
const STANCE_RANK = { contradicts: 0, supports: 1, context: 2 } as const;
const GRID = "grid grid-cols-[22px_250px_150px_118px_minmax(0,1fr)_200px] items-center gap-3";

export function CheckStep({
  docs,
  baseline,
  classifications,
  phase,
  evidence,
  gaps,
  findings,
  questions,
  rfis,
  risks,
  accepted,
  edits,
  onAccept,
  onEdit,
  onOpenQuotes,
  onSend,
}: {
  docs: DocMeta[];
  baseline: BaselineAssumption[];
  classifications: DocClassification[];
  phase: ScanPhase;
  evidence: Evidence[];
  gaps: Gap[];
  findings: Finding[];
  questions: Question[];
  rfis: Rfi[];
  risks: Risk[];
  accepted: Set<string>;
  edits: Record<string, string>;
  onAccept: (id: string, on: boolean) => void;
  onEdit: (id: string, text: string | null) => void;
  onOpenQuotes: (quotes: Quote[]) => void;
  onSend: (count: number) => void;
}) {
  const done = phase === "done";
  const [showDocs, setShowDocs] = useState(false);
  const [open, setOpen] = useState<Set<string> | null>(null); // null = the default (the check others hang on)
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pendingScroll = useRef<string | null>(null);

  const clsById = useMemo(() => new Map(classifications.map((c) => [c.docId, c])), [classifications]);
  const labels = useMemo(() => docLabels(classifications), [classifications]);
  const docName = useCallback((id: string) => labels.get(id) ?? docs.find((d) => d.id === id)?.filename ?? id, [labels, docs]);
  const findingBy = useMemo(() => new Map(findings.map((f) => [f.assumptionId, f])), [findings]);
  const baseBy = useMemo(() => new Map(baseline.map((b) => [b.id, b])), [baseline]);
  const evidenceBy = useMemo(() => {
    const m = new Map<string, Evidence[]>();
    for (const e of evidence) if (!isInjectedEvidence(e.display)) m.set(e.assumptionId, [...(m.get(e.assumptionId) ?? []), e]);
    return m;
  }, [evidence]);
  const rfiFor = useCallback((aid: string) => sortRfis(rfis.filter((r) => r.assumptionIds.includes(aid))), [rfis]);
  const rfiText = (r: Rfi) => edits[r.id] ?? r.request;

  const qCount = useCallback((aid: string) => questions.filter((q) => q.assumptionIds.includes(aid)).length, [questions]);
  // Severity order, then checks that others hang on, then more evidence.
  const order = useMemo(
    () =>
      [...findings]
        .sort(
          (a, b) =>
            SEVERITY[a.label] - SEVERITY[b.label] ||
            qCount(b.assumptionId) - qCount(a.assumptionId) ||
            (evidenceBy.get(b.assumptionId)?.length ?? 0) - (evidenceBy.get(a.assumptionId)?.length ?? 0) ||
            a.assumptionId.localeCompare(b.assumptionId),
        )
        .map((f) => f.assumptionId),
    [findings, qCount, evidenceBy],
  );
  const need = order.filter((a) => findingBy.get(a)!.label !== "confirmed");
  const good = order.filter((a) => findingBy.get(a)!.label === "confirmed");

  // Default: expand the check that other checks hang on (construction start), else the first open one.
  const defaultOpen = useMemo(() => {
    const votes = new Map<string, number>();
    for (const f of findings) if (f.dependsOn) votes.set(f.dependsOn, (votes.get(f.dependsOn) ?? 0) + 1);
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? need[0];
    return new Set(top ? [top] : []);
  }, [findings, need]);
  const openSet = open ?? defaultOpen;
  const toggle = (id: string) =>
    setOpen(() => {
      const n = new Set(openSet);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const jumpTo = (id: string) => {
    pendingScroll.current = id;
    setOpen(new Set(openSet).add(id));
  };
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => document.querySelector(`[data-testid="check-${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openSet]);

  // Questions that reach a check on this page, each counted once.
  const visibleRfis = useMemo(() => rfis.filter((r) => r.assumptionIds.some((a) => findingBy.has(a))), [rfis, findingBy]);
  const nAccepted = visibleRfis.filter((r) => accepted.has(r.id)).length;
  const drawerRfi = rfis.find((r) => r.id === drawerId) ?? null;

  const excluded = classifications.filter((c) => c.projectMatch === "different_project").length;
  const unverified = evidence.filter((e) => !e.quote.verified).length;
  const status =
    phase === "classifying"
      ? `Classifying documents (${classifications.length} of ${docs.length})...`
      : phase === "evidence"
        ? "Gathering evidence and verifying quotes against source text..."
        : "Reconciling evidence against the baseline...";

  // What the open question rests on: the quotes of the judgment call it touches, else the contradicting evidence.
  const drawerQuotes = useMemo(() => {
    if (!drawerRfi) return [] as Quote[];
    const ids = drawerRfi.assumptionIds;
    let quotes = questions.filter((q) => q.assumptionIds.some((a) => ids.includes(a))).flatMap((q) => q.evidence);
    if (!quotes.length) quotes = ids.flatMap((a) => (evidenceBy.get(a) ?? []).filter((e) => e.stance === "contradicts").map((e) => e.quote));
    if (!quotes.length) quotes = ids.flatMap((a) => (evidenceBy.get(a) ?? []).map((e) => e.quote)).slice(0, 5);
    const seen = new Set<string>();
    return quotes.filter((q) => {
      const k = `${q.docId}|${q.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [drawerRfi, questions, evidenceBy]);
  const drawerGaps = useMemo(() => (drawerRfi ? gaps.filter((g) => drawerRfi.assumptionIds.includes(g.assumptionId)) : []), [drawerRfi, gaps]);

  const openQuote = useCallback((q: Quote) => onOpenQuotes([q]), [onOpenQuotes]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cross-check and review</h2>
          <div className="mt-0.5 text-[13px] text-slate-600" data-testid="scan-status">
            {done ? (
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="text-emerald-600">✓</span>
                <span>
                  {docs.length} documents read{excluded > 0 && ` · ${excluded} excluded as a different project`} · {evidence.filter((e) => !isInjectedEvidence(e.display)).length} facts,{" "}
                  {unverified ? `${unverified} quote${unverified === 1 ? "" : "s"} not verified` : "every quote verified"}
                </span>
                <button onClick={() => setShowDocs((s) => !s)} className="ml-1 font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
                  {showDocs ? "Hide documents" : "Show documents"}
                </button>
              </p>
            ) : (
              <p className="flex items-center gap-2">
                <Spinner />
                {status}
              </p>
            )}
          </div>
        </div>
        <PrimaryButton disabled={!done || nAccepted === 0} onClick={() => setSending(true)}>
          {done ? `Send ${nAccepted} question${nAccepted === 1 ? "" : "s"} to seller` : "Send questions to seller"}
        </PrimaryButton>
      </div>

      {!done && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-500"
            style={{ width: `${phase === "classifying" ? (classifications.length / Math.max(1, docs.length)) * 60 : phase === "evidence" ? 80 : 92}%` }}
          />
        </div>
      )}

      {(!done || showDocs) && <DocChips docs={docs} classifications={classifications} phase={phase} />}

      {done && (
        <div className="fade-in">
          <GroupHeader title="Needs the seller's answer" count={need.length} hint="Click a row for the evidence and the question · untick a question to leave it out" />
          <CheckList>
            {need.map(renderRow)}
          </CheckList>
          <GroupHeader title="Checked and consistent" count={good.length} />
          <CheckList>
            {good.map(renderRow)}
          </CheckList>
          <Legend />
        </div>
      )}

      <QuestionDrawer
        rfi={drawerRfi}
        findings={findingBy}
        quotes={drawerQuotes}
        gaps={drawerGaps}
        accepted={drawerRfi ? accepted.has(drawerRfi.id) : false}
        edited={drawerRfi ? !!edits[drawerRfi.id] : false}
        text={drawerRfi ? rfiText(drawerRfi) : ""}
        docName={docName}
        onClose={() => setDrawerId(null)}
        onAccept={(on) => drawerRfi && onAccept(drawerRfi.id, on)}
        onSave={(t) => drawerRfi && onEdit(drawerRfi.id, t)}
        onOpenQuote={openQuote}
      />
      {sending && (
        <SendModal
          groups={sendGroups()}
          count={nAccepted}
          findings={findingBy}
          rfiText={rfiText}
          edited={(r) => !!edits[r.id]}
          onBack={() => setSending(false)}
          onConfirm={() => {
            setSending(false);
            onSend(nAccepted);
          }}
        />
      )}
    </div>
  );

  // ---- pieces that close over the page state ----

  /** Each accepted question is listed once, under the first check (in page order) that it belongs to. */
  function sendGroups() {
    const seen = new Set<string>();
    return order
      .map((aid) => ({
        aid,
        rfis: rfiFor(aid).filter((r) => accepted.has(r.id) && !seen.has(r.id) && seen.add(r.id)),
      }))
      .filter((g) => g.rfis.length);
  }

  function renderRow(aid: string) {
    const f = findingBy.get(aid)!;
    const b = baseBy.get(aid);
    const ok = f.label === "confirmed";
    const rf = rfiFor(aid);
    const isOpen = openSet.has(aid);
    const acc = rf.filter((r) => accepted.has(r.id)).length;
    return (
      <div key={aid} data-testid={`check-${aid}`} className="scroll-mt-20 border-t border-slate-100 first:border-t-0">
        <button
          onClick={() => toggle(aid)}
          aria-expanded={isOpen}
          className={cx(GRID, "w-full px-3.5 py-[9px] text-left transition hover:bg-slate-50 [&>*]:min-w-0 [&>*]:justify-self-start", isOpen && "bg-sky-50 hover:bg-sky-50")}
        >
          <span className={cx("text-[11px] text-slate-400 transition-transform", isOpen && "rotate-90")}>▶</span>
          <span className="max-w-full truncate text-[13.5px] font-semibold text-slate-900">{assumptionName(aid)}</span>
          <span className="-ml-1.5 max-w-full truncate rounded bg-slate-100/70 px-1.5 py-0.5 text-[12.5px] text-slate-800" title={b?.display ?? f.baselineDisplay}>
            {b?.short ?? b?.display ?? f.baselineDisplay}
          </span>
          <LabelChip label={f.label} size="sm" />
          <span className="max-w-full truncate text-[12.5px] text-slate-700" title={f.currentDisplay}>
            {f.currentShort ?? f.currentDisplay}
          </span>
          <span className="max-w-full justify-self-end! whitespace-nowrap">
            {ok ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/25 bg-emerald-50 px-2.5 py-[3px] text-[11px] font-semibold text-emerald-800">
                ✓ Checks out{rf.length > 0 && <span className="font-bold">· {acc} of {rf.length} clean-up</span>}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-amber-600/30 bg-amber-50 px-2.5 py-[3px] text-[11px] font-semibold text-amber-800">
                {rf.length === 0 ? "No question drafted" : `${acc} of ${rf.length} question${rf.length === 1 ? "" : "s"} to send`}
              </span>
            )}
          </span>
        </button>
        {isOpen && (
          <div className="border-t border-dashed border-slate-200 bg-white px-3.5 pb-3.5 pl-12 pt-1">
            {ok ? renderGood(aid, f, rf) : renderAsk(aid, f, rf)}
            <div className="mt-3.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Supporting evidence <span className="font-medium normal-case tracking-normal text-slate-400">· one line per fact · click a page to open the document</span>
            </div>
            {renderEvidence(aid, f)}
          </div>
        )}
      </div>
    );
  }

  function rfiLine(r: Rfi, small?: boolean) {
    const on = accepted.has(r.id);
    return (
      <div key={r.id} className={cx("mt-1.5 grid grid-cols-[18px_auto_minmax(0,1fr)] items-start gap-2.5", !on && "opacity-60")}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onAccept(r.id, e.target.checked)}
          title="Include this question"
          aria-label="Include this question"
          className="mt-[3px] h-3.5 w-3.5 accent-slate-900"
        />
        <span className="mt-[3px]">
          <PriorityBadge priority={r.priority} />
        </span>
        <button
          onClick={() => setDrawerId(r.id)}
          title="Open and edit this question"
          className={cx(
            "group text-left leading-snug decoration-amber-600 hover:underline",
            small ? "text-[12.5px] font-medium text-slate-800" : "text-sm font-semibold text-slate-900",
            !on && "text-slate-400 line-through",
          )}
        >
          {rfiText(r)}
          {edits[r.id] && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-px align-[2px] text-[10px] font-bold uppercase tracking-wide text-sky-800">edited</span>}
          <span className="ml-2 whitespace-nowrap text-[10.5px] font-semibold text-amber-700 opacity-0 transition-opacity group-hover:opacity-100">edit ✎</span>
        </button>
      </div>
    );
  }

  function renderAsk(aid: string, f: Finding, rf: Rfi[]) {
    const rk = risks.filter((r) => r.assumptionIds.includes(aid));
    const dep = f.dependsOn && findingBy.has(f.dependsOn) ? f.dependsOn : null;
    return (
      <div className="mt-2.5 rounded-[10px] border border-l-4 border-amber-600/45 border-l-amber-500 bg-amber-50 px-4 py-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800">Our question{rf.length === 1 ? "" : "s"} to the seller</div>
        {rf.length === 0 && <div className="text-[13px] text-slate-600">No question was drafted for this check.</div>}
        {rf.map((r) => rfiLine(r))}
        <div className="mt-2.5 text-xs leading-snug text-slate-600">
          <b className="font-semibold text-slate-800">Why we&apos;re asking.</b> {f.summary}
        </div>
        {dep && (
          <div className="mt-2.5 border-t border-amber-600/25 pt-2 text-xs text-slate-600">
            <button onClick={() => jumpTo(dep)} className="text-left font-semibold text-slate-800 underline decoration-amber-600/50 underline-offset-2 hover:decoration-amber-700">
              Hangs on the {assumptionName(dep).toLowerCase()} question
            </button>
          </div>
        )}
        {rk.map((r) => (
          <div key={r.id} className="mt-2.5 text-xs leading-snug text-slate-600">
            <b className="font-semibold text-slate-700">Also note.</b> {r.title}: {r.detail}
          </div>
        ))}
      </div>
    );
  }

  function renderGood(aid: string, f: Finding, rf: Rfi[]) {
    const rk = risks.filter((r) => r.assumptionIds.includes(aid));
    return (
      <div className="mt-3 rounded-[10px] border border-emerald-600/25 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
        <b className="font-semibold">Checks out.</b> {f.summary}
        {rf.length > 0 && (
          <>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">Minor clean-up to ask for</div>
            {rf.map((r) => rfiLine(r, true))}
          </>
        )}
        {rk.map((r) => (
          <div key={r.id} className="mt-2 text-xs text-slate-600">
            <b className="font-semibold text-slate-700">Also note.</b> {r.title}: {r.detail}
          </div>
        ))}
      </div>
    );
  }

  function renderEvidence(aid: string, f: Finding) {
    const items = evidenceBy.get(aid) ?? [];
    const myGaps = gaps.filter((g) => g.assumptionId === aid);
    const ids = [...new Set([...items.map((e) => e.docId), ...myGaps.map((g) => g.docId)])];
    const rank = (d: string) => Math.min(3, ...items.filter((e) => e.docId === d).map((e) => STANCE_RANK[e.stance]));
    ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const sellerSays = ids.some((d) => clsById.get(d)?.sourceRole === "seller");
    const row = (d: string) => {
      const mine = items.filter((e) => e.docId === d);
      const gap = myGaps.find((g) => g.docId === d);
      return (
        <div key={d} className="grid grid-cols-[124px_minmax(0,1fr)] items-start gap-2 border-t border-slate-100 py-1 first:border-t-0 [break-inside:avoid]">
          <div className="flex flex-col items-start gap-[3px]">
            <span className="text-xs font-semibold leading-tight text-slate-800">{docName(d)}</span>
            <SourceTag role={clsById.get(d)?.sourceRole} />
          </div>
          <div>
            {mine.map((e, i) => (
              <FactLine key={i} e={e} label={f.label} onOpen={onOpenQuotes} />
            ))}
            {gap && (
              <div className="flex items-start gap-[7px] py-px text-xs italic leading-tight text-slate-500" title={gap.note}>
                <span className="mx-px mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-dashed border-slate-400" />
                <span className="min-w-0 flex-1">Not stated: {gap.note.split(". ")[0].replace(/\.$/, "")}.</span>
              </div>
            )}
          </div>
        </div>
      );
    };
    if (sellerSays) {
      const lane = (pred: (d: string) => boolean, title: string, hint: string) => (
        <div>
          <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {title} <span className="font-medium normal-case tracking-normal text-slate-400">{hint}</span>
          </div>
          {ids.filter(pred).map(row)}
          {!ids.filter(pred).length && <div className="text-xs text-slate-400">Nothing from this side.</div>}
        </div>
      );
      return (
        <div className="mt-1 grid grid-cols-2 items-start gap-4" data-testid={`lanes-${aid}`}>
          {lane((d) => clsById.get(d)?.sourceRole !== "seller", "Evidence", "independent, advisor, IRS")}
          {lane((d) => clsById.get(d)?.sourceRole === "seller", "Seller says", "Seller and its counsel")}
        </div>
      );
    }
    return <div className="mt-1 columns-2 gap-4">{ids.map(row)}</div>;
  }
}

function FactLine({ e, label, onOpen }: { e: Evidence; label: Label; onOpen: (q: Quote[]) => void }) {
  const cls = e.stance === "supports" ? "bg-emerald-100 text-emerald-700" : e.stance === "contradicts" ? MARK_CON[label] : "bg-transparent text-slate-400";
  return (
    <div className="flex items-start gap-[7px] py-px text-xs leading-tight text-slate-800">
      <span className={cx("mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", cls)} title={e.stance}>
        {e.stance === "supports" ? "✓" : e.stance === "contradicts" ? "✕" : "·"}
      </span>
      <span className="min-w-0 flex-1 text-slate-700">{e.display}</span>
      <button
        onClick={() => onOpen([e.quote])}
        title={e.quote.text}
        className="mt-px shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] text-slate-500 hover:border-slate-900 hover:bg-slate-900 hover:text-white"
      >
        p.{e.quote.page}
      </button>
    </div>
  );
}

function CheckList({ children }: { children: ReactNode }) {
  return (
    <Card className="mt-2 overflow-x-auto">
      <div className="min-w-[1080px]">
        <div className={cx(GRID, "border-b border-slate-200 bg-slate-50 px-3.5 py-[7px] text-[10px] font-semibold uppercase tracking-wider text-slate-500")}>
          <span />
          <span>Check</span>
          <span className="-my-[7px] -ml-1.5 bg-slate-100 px-1.5 py-[7px]">Term sheet</span>
          <span>Result</span>
          <span>What the data room says</span>
          <span className="justify-self-end">Next step</span>
        </div>
        {children}
      </div>
    </Card>
  );
}


function GroupHeader({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="mt-4 flex items-baseline gap-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <span className="text-xs text-slate-400">
        {count} check{count === 1 ? "" : "s"}
      </span>
      {hint && <span className="ml-auto text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-slate-500" data-testid="check-legend">
      <b className="font-semibold text-slate-600">Marks</b>
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span> agrees with the term sheet
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-800">✕</span> disagrees (coloured by the check&apos;s result)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center text-[10px] font-bold text-slate-400">·</span> context
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed border-slate-400" /> expected, not stated
      </span>
      <b className="ml-2 font-semibold text-slate-600">Source</b>
      <SourceTag role="seller" />
      <SourceTag role="seller_advisor" />
      <SourceTag role="independent" />
      <SourceTag role="government" />
    </div>
  );
}

function DocChips({ docs, classifications, phase }: { docs: DocMeta[]; classifications: DocClassification[]; phase: ScanPhase }) {
  const byId = new Map(classifications.map((c) => [c.docId, c]));
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" data-testid="doc-chips">
      {docs.map((d, idx) => {
        const c = byId.get(d.id);
        if (!c) {
          const next = phase === "classifying" && classifications.length === idx;
          return (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/50 px-3 py-2 text-xs text-slate-400">
              <span className="font-medium">Document {idx + 1}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {next ? (
                  <>
                    <Spinner className="h-3 w-3" /> Reading
                  </>
                ) : (
                  "Queued"
                )}
              </span>
            </li>
          );
        }
        const badge = MATCH_BADGE[c.projectMatch] ?? MATCH_BADGE.unclear;
        const flagged = c.projectMatch === "different_project";
        return (
          <li
            key={d.id}
            title={`${d.filename}\n${c.summary}`}
            data-testid={`doc-${d.id}`}
            className={cx("fade-in flex flex-col gap-1.5 rounded-lg border bg-white px-3 py-2 shadow-sm", flagged ? "border-red-300 ring-1 ring-red-100" : "border-slate-200")}
          >
            <span className="truncate text-xs font-semibold text-slate-900">{shortType(c.docType)}</span>
            <div className="flex flex-wrap gap-1">
              <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", badge.cls)}>{badge.text}</span>
              <SourceTag role={c.sourceRole} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
