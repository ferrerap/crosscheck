"use client";
import { Fragment, useMemo, useState } from "react";
import type { BaselineAssumption, DocClassification, Evidence, Finding, Gap, Label, Quote } from "@/engine/types";
import { GROUPS, assumptionKind, assumptionName, isInjection, shortType } from "@/lib/meta";
import type { DocMeta } from "@/lib/runner";
import { Card, LabelChip, PrimaryButton, Spinner, cx } from "./ui";

export type ScanPhase = "classifying" | "evidence" | "reconcile" | "done";

const MATCH_BADGE: Record<string, { text: string; cls: string }> = {
  match: { text: "Match", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  different_project: { text: "Different project", cls: "bg-red-50 text-red-800 ring-red-600/25" },
  general_reference: { text: "General reference", cls: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  unclear: { text: "Unclear", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
};

// Cell colors: supports is always green, context neutral, and a contradiction takes the color of the row's result.
const CONTRADICT_CELL: Record<Label, string> = {
  changed: "border-amber-300 bg-amber-100 text-amber-950",
  contradicted: "border-red-300 bg-red-100 text-red-950",
  conflicting: "border-purple-300 bg-purple-100 text-purple-950",
  unverified: "border-slate-300 bg-slate-200 text-slate-800",
  confirmed: "border-amber-300 bg-amber-100 text-amber-950",
};
const SUPPORT_CELL = "border-emerald-200 bg-emerald-50 text-emerald-900";
const CONTEXT_CELL = "border-slate-200 bg-slate-50 text-slate-700";


export function ScanStep({
  docs,
  baseline,
  classifications,
  phase,
  evidence,
  gaps,
  findings,
  reviewCount,
  onOpenQuotes,
  onContinue,
}: {
  docs: DocMeta[];
  baseline: BaselineAssumption[];
  classifications: DocClassification[];
  phase: ScanPhase;
  evidence: Evidence[];
  gaps: Gap[];
  findings: Finding[];
  reviewCount: number;
  onOpenQuotes: (quotes: Quote[]) => void;
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
          : `Done. ${evidence.length} evidence quotes verified, ${reviewCount} judgment call${reviewCount === 1 ? "" : "s"} for you.`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Cross-checking the data room</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-600" data-testid="scan-status">
            {phase !== "done" && <Spinner />}
            {status}
          </p>
        </div>
        <PrimaryButton disabled={phase !== "done"} onClick={onContinue}>
          Continue to review
        </PrimaryButton>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-500"
          style={{ width: `${phase === "classifying" ? (done / Math.max(1, docs.length)) * 60 : phase === "evidence" ? 80 : phase === "reconcile" ? 92 : 100}%` }}
        />
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" data-testid="doc-chips">
        {docs.map((d, idx) => {
          const c = byId.get(d.id);
          if (!c) {
            const next = phase === "classifying" && classifications.length === idx;
            return (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/50 px-3 py-2 text-xs text-slate-400">
                <span className="font-mono font-semibold">{d.id}</span>
                <span className="ml-auto flex items-center gap-1.5">{next ? <><Spinner className="h-3 w-3" /> Reading</> : "Queued"}</span>
              </li>
            );
          }
          const badge = MATCH_BADGE[c.projectMatch] ?? MATCH_BADGE.unclear;
          const inj = isInjection(c);
          const flagged = inj || c.projectMatch === "different_project";
          return (
            <li
              key={d.id}
              title={`${d.filename}\n${c.summary}`}
              data-testid={`doc-${d.id}`}
              className={cx("fade-in flex flex-col gap-1.5 rounded-lg border bg-white px-3 py-2 shadow-sm", flagged ? "border-red-300 ring-1 ring-red-100" : "border-slate-200")}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-slate-400">{d.id}</span>
                <span className="truncate text-xs font-semibold text-slate-900">{shortType(c.docType)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", badge.cls)}>{badge.text}</span>
                {inj && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Embedded instruction</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {phase === "done" && (
        <EvidenceMatrix
          docs={docs}
          baseline={baseline}
          classifications={classifications}
          evidence={evidence}
          gaps={gaps}
          findings={findings}
          onOpenQuotes={onOpenQuotes}
        />
      )}
    </div>
  );
}

function EvidenceMatrix({
  docs,
  baseline,
  classifications,
  evidence,
  gaps,
  findings,
  onOpenQuotes,
}: {
  docs: DocMeta[];
  baseline: BaselineAssumption[];
  classifications: DocClassification[];
  evidence: Evidence[];
  gaps: Gap[];
  findings: Finding[];
  onOpenQuotes: (quotes: Quote[]) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const clsById = useMemo(() => new Map(classifications.map((c) => [c.docId, c])), [classifications]);
  const findingBy = useMemo(() => new Map(findings.map((f) => [f.assumptionId, f])), [findings]);
  const rows = baseline.filter((b) => assumptionKind(b.id) !== "term");
  // One column per document with evidence; official references (IRS lists, guidance) share a single column.
  const cols = useMemo(() => {
    const ids = [...new Set(evidence.map((e) => e.docId))].sort();
    const refs = ids.filter((id) => clsById.get(id)?.projectMatch === "general_reference");
    const own = ids.filter((id) => !refs.includes(id)).map((id) => ({ key: id, docIds: [id] }));
    return refs.length ? [...own, { key: "REF", docIds: refs }] : own;
  }, [evidence, clsById]);
  const colSet = new Set(cols.flatMap((c) => c.docIds));
  const anchorId = docs.find((d) => d.role === "anchor")?.id;
  const also = classifications.filter((c) => c.docId !== anchorId && (!colSet.has(c.docId) || isInjection(c)));
  const totalCols = cols.length + 3;

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="fade-in mt-8" data-testid="evidence-matrix">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">Evidence matrix</h3>
        <p className="text-xs text-slate-500">Click a cell to open the source with its quotes highlighted. Click a row name for the finding.</p>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] table-fixed border-separate border-spacing-0 text-left break-words">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-20 w-[150px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold">Assumption</th>
                <th className="w-[112px] border-b border-slate-200 bg-slate-100 px-2 py-2.5 font-semibold">Term sheet</th>
                {cols.map((col) => {
                  const c = col.key === "REF" ? undefined : clsById.get(col.key);
                  const title = col.key === "REF" ? col.docIds.map((id) => docs.find((x) => x.id === id)?.filename).join(", ") : docs.find((x) => x.id === col.key)?.filename;
                  return (
                    <th key={col.key} className="border-b border-slate-200 bg-slate-50 px-1.5 py-2 align-top font-semibold" title={title}>
                      <div className="font-mono text-[10px] text-slate-400">
                        {col.key === "REF" ? col.docIds.join(" ") : col.key}
                        {c && isInjection(c) && <span className="ml-1 rounded bg-red-600 px-1 py-px font-sans text-[9px] font-bold text-white">IGNORED</span>}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] normal-case leading-tight tracking-normal text-slate-800">
                        {col.key === "REF" ? "IRS references" : c ? shortType(c.docType) : col.key}
                      </div>
                    </th>
                  );
                })}
                <th className="w-[104px] border-b border-l border-slate-200 bg-slate-50 px-2 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.filter((g) => g.kind !== "term").map((g) => {
                const groupRows = rows.filter((r) => assumptionKind(r.id) === g.kind);
                if (!groupRows.length) return null;
                return (
                  <Fragment key={g.kind}>
                    <tr>
                      <td colSpan={totalCols} className="border-b border-slate-200 bg-slate-100/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <div className="sticky left-4 w-fit">{g.label}</div>
                      </td>
                    </tr>
                    {groupRows.map((b) => {
                      const f = findingBy.get(b.id);
                      const isOpen = open.has(b.id);
                      return (
                        <Fragment key={b.id}>
                          <tr data-testid={`row-${b.id}`}>
                            <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-1.5 align-middle">
                              <button onClick={() => toggle(b.id)} aria-expanded={isOpen} className="flex items-start gap-2 text-left">
                                <span className={cx("mt-0.5 text-slate-400 transition", isOpen && "rotate-90")}>&#9656;</span>
                                <span>
                                  <span className="block text-[13px] font-semibold leading-snug text-slate-900 hover:underline">{assumptionName(b.id)}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{b.id}</span>
                                </span>
                              </button>
                            </td>
                            <td className="border-b border-slate-100 bg-slate-50/60 px-1 py-1 align-middle">
                              <button
                                title={b.display}
                                disabled={!b.quote}
                                onClick={() => b.quote && onOpenQuotes([b.quote])}
                                className="block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium leading-snug text-slate-800 hover:border-slate-400 disabled:cursor-default"
                              >
                                <span className="line-clamp-3">{b.short ?? b.display}</span>
                              </button>
                            </td>
                            {cols.map((col) => (
                              <td key={col.key} className="border-b border-slate-100 px-1 py-1 align-middle">
                                <Cell
                                  items={evidence.filter((e) => e.assumptionId === b.id && col.docIds.includes(e.docId))}
                                  gap={gaps.find((x) => x.assumptionId === b.id && col.docIds.includes(x.docId))}
                                  label={f?.label ?? "unverified"}
                                  onOpen={onOpenQuotes}
                                />
                              </td>
                            ))}
                            <td className="border-b border-l border-slate-100 px-2 py-1.5 align-middle">{f ? <LabelChip label={f.label} size="sm" /> : <span className="text-xs text-slate-400">—</span>}</td>
                          </tr>
                          {isOpen && f && (
                            <tr>
                              <td colSpan={totalCols} className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="sticky left-4 max-w-4xl text-sm leading-relaxed text-slate-700">
                                  <span className="mr-2 font-semibold text-slate-900">
                                    {f.baselineDisplay} <span className="mx-1 text-slate-400">→</span> {f.currentDisplay}
                                  </span>
                                  {f.summary}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500" data-testid="matrix-legend">
        <span className="font-semibold text-slate-600">Legend</span>
        <Swatch cls={SUPPORT_CELL} text="supports the term sheet" />
        <Swatch cls={CONTRADICT_CELL.changed} text="differs: changed" />
        <Swatch cls={CONTRADICT_CELL.contradicted} text="contradicted" />
        <Swatch cls={CONTRADICT_CELL.conflicting} text="conflicting" />
        <Swatch cls={CONTRADICT_CELL.unverified} text="unverified" />
        <Swatch cls={CONTEXT_CELL} text="context only" />
        <span>
          <em>not stated</em>: the document should say it but doesn&apos;t
        </span>
        <span>— not mentioned</span>
      </div>

      {also.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="also-checked">
          <span className="font-semibold text-slate-600">Also checked:</span>
          {also.map((c) => {
            const inj = isInjection(c);
            const diff = c.projectMatch === "different_project";
            return (
              <span
                key={c.docId}
                title={c.projectMatchReason || c.summary}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1",
                  inj || diff ? "border-red-200 text-red-800" : "border-slate-200 text-slate-700",
                )}
              >
                <span className="font-mono text-[10px] font-semibold text-slate-400">{c.docId}</span>
                {shortType(c.docType)}
                {diff && <span className="font-semibold">· different project, excluded</span>}
                {inj && <span className="font-semibold">· embedded instruction ignored</span>}
                {!diff && !inj && !colSet.has(c.docId) && <span className="text-slate-400">· no evidence</span>}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Swatch({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("h-3 w-5 rounded border", cls)} />
      {text}
    </span>
  );
}

function Cell({ items, gap, label, onOpen }: { items: Evidence[]; gap?: Gap; label: Label; onOpen: (q: Quote[]) => void }) {
  if (items.length === 0) {
    if (gap) {
      return (
        <div className="px-1.5 py-1 text-[11px] italic text-slate-400" title={gap.note}>
          not stated
        </div>
      );
    }
    return <div className="px-2 py-1.5 text-center text-xs text-slate-300">—</div>;
  }
  const primary = items.find((e) => e.stance === "contradicts") ?? items.find((e) => e.stance === "supports") ?? items[0];
  const cls = primary.stance === "supports" ? SUPPORT_CELL : primary.stance === "contradicts" ? CONTRADICT_CELL[label] : CONTEXT_CELL;
  const tip = items.map((e) => `${e.display}: ${e.note}`).join("\n");
  return (
    <button
      onClick={() => onOpen(items.map((e) => e.quote))}
      title={`${primary.display}\n\n${tip}`}
      data-stance={primary.stance}
      className={cx("flex w-full items-start justify-between gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition hover:brightness-95 hover:shadow-sm", cls)}
    >
      <span className="line-clamp-4">{primary.short ?? primary.display}</span>
      {items.length > 1 && <span className="shrink-0 rounded bg-black/10 px-1 text-[10px] font-semibold">+{items.length - 1}</span>}
    </button>
  );
}
