"use client";
// Confirm modal for sending the accepted questions to the seller (nothing is actually sent in this demo).
import { useEffect } from "react";
import type { Finding, Rfi } from "@/engine/types";
import { assumptionName } from "@/lib/meta";
import { LabelChip, PriorityBadge } from "./ui";

export function SendModal({
  dealName,
  groups,
  count,
  findings,
  rfiText,
  edited,
  onBack,
  onConfirm,
}: {
  dealName: string;
  groups: { aid: string; rfis: Rfi[] }[];
  count: number;
  findings: Map<string, Finding>;
  rfiText: (r: Rfi) => string;
  edited: (r: Rfi) => boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/45 px-6 py-12" onClick={(e) => e.target === e.currentTarget && onBack()}>
      <div role="dialog" aria-label="Questions to the seller" data-testid="send-modal" className="max-h-[calc(100vh-6rem)] w-[820px] max-w-full overflow-auto rounded-2xl bg-white px-6 py-5 shadow-2xl">
        <h3 className="text-[17px] font-semibold">Questions to the seller</h3>
        <div className="mt-0.5 text-[12.5px] text-slate-600">
          {count} question{count === 1 ? "" : "s"} across {groups.length} check{groups.length === 1 ? "" : "s"} · {dealName}
        </div>
        {groups.map((g) => (
          <div key={g.aid}>
            <div className="mt-3.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {assumptionName(g.aid)}
              {findings.get(g.aid) && <LabelChip label={findings.get(g.aid)!.label} size="sm" />}
            </div>
            {g.rfis.map((r) => (
              <div key={r.id} className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-[13px] leading-snug text-slate-800">
                <span className="mt-0.5">
                  <PriorityBadge priority={r.priority} />
                </span>
                <span>
                  {rfiText(r)}
                  {edited(r) && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-px align-[1px] text-[10px] font-bold uppercase tracking-wide text-sky-800">edited</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="mt-5 flex justify-end gap-2.5">
          <button onClick={onBack} className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:border-slate-500">
            Back
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-700">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
