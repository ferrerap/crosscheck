"use client";
// Right-hand drawer for one question to the seller: editable wording, why we're asking, what it rests on.
import { useEffect, useState } from "react";
import type { Finding, Gap, Quote, Rfi } from "@/engine/types";
import { assumptionName } from "@/lib/meta";
import { LabelChip, PriorityBadge, QuoteChip, cx } from "./ui";

export function QuestionDrawer({
  rfi,
  findings,
  quotes,
  gaps,
  accepted,
  edited,
  text,
  docName,
  onClose,
  onAccept,
  onSave,
  onOpenQuote,
}: {
  rfi: Rfi | null;
  findings: Map<string, Finding>;
  quotes: Quote[];
  gaps: Gap[];
  accepted: boolean;
  edited: boolean;
  text: string;
  docName: (id: string) => string;
  onClose: () => void;
  onAccept: (on: boolean) => void;
  /** Pass null to restore the original wording. */
  onSave: (text: string | null) => void;
  onOpenQuote: (q: Quote) => void;
}) {
  const open = !!rfi;
  const [draft, setDraft] = useState(text);
  // Re-seed the textarea when a different question is opened or its saved wording changes.
  const [seed, setSeed] = useState(`${rfi?.id}|${text}`);
  if (seed !== `${rfi?.id}|${text}`) {
    setSeed(`${rfi?.id}|${text}`);
    setDraft(text);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The source viewer and the send modal sit above the drawer and take Escape first.
      if (e.key !== "Escape" || document.querySelector('[data-testid="pdf-drawer"], [data-testid="send-modal"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const dirty = draft.trim() !== text.trim();
  return (
    <aside
      data-testid="question-drawer"
      aria-hidden={!open}
      aria-label="Question to the seller"
      className={cx(
        "fixed bottom-0 right-0 top-14 z-[35] w-full max-w-[560px] overflow-auto border-l border-slate-200 bg-white px-6 pb-8 pt-5 shadow-[-12px_0_32px_rgba(15,23,42,0.14)] transition-transform duration-200",
        open ? "translate-x-0" : "pointer-events-none translate-x-[102%]",
      )}
    >
      {rfi && (
        <>
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Question to the seller</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                {rfi.assumptionIds.map((a) => {
                  const f = findings.get(a);
                  return (
                    <span key={a} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900">
                      {assumptionName(a)}
                      {f && <LabelChip label={f.label} size="sm" />}
                    </span>
                  );
                })}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="ml-auto text-2xl leading-none text-slate-400 hover:text-slate-700">
              ×
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 text-[12.5px] text-slate-700">
            <PriorityBadge priority={rfi.priority} />
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="h-3.5 w-3.5 accent-slate-900" checked={accepted} onChange={(e) => onAccept(e.target.checked)} />
              Include in the questions sent
            </label>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
            aria-label="Question wording"
            className="mt-2 min-h-[130px] w-full resize-y rounded-[10px] border border-amber-600/45 border-l-4 border-l-amber-500 bg-amber-50 px-3.5 py-3 text-sm font-semibold leading-relaxed text-slate-900 focus:bg-white focus:outline-2 focus:outline-offset-1 focus:outline-slate-900"
          />
          <div className="mt-2 flex items-center gap-2.5">
            <button
              onClick={() => onSave(draft.trim() && draft.trim() !== rfi.request ? draft.trim() : null)}
              disabled={!dirty}
              className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Save wording
            </button>
            {edited && (
              <button onClick={() => onSave(null)} className="rounded-lg border border-slate-300 px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-500">
                Restore original
              </button>
            )}
            <span className="ml-auto text-[11.5px] text-slate-400">{edited ? "Edited by you" : "As drafted from the data room"}</span>
          </div>

          <div className="mt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Why we&apos;re asking</div>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{rfi.reason}</p>

          <div className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            What it rests on{" "}
            <span className="font-medium normal-case tracking-normal text-slate-400">
              · {quotes.length} quote{quotes.length === 1 ? "" : "s"}
              {gaps.length ? ` · ${gaps.length} not stated` : ""}
            </span>
          </div>
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            {quotes.map((q, i) => (
              <QuoteChip key={i} quote={q} docName={docName(q.docId)} onOpen={onOpenQuote} full />
            ))}
          </div>
          {gaps.map((g, i) => (
            <div key={i} className="mt-2 flex items-start gap-2 text-xs leading-snug text-slate-600">
              <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-dashed border-slate-400" />
              <span>
                <b className="font-semibold text-slate-800">{docName(g.docId)}</b> · {g.note}
              </span>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
