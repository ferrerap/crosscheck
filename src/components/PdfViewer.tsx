"use client";
// Right-side drawer: renders a source PDF (all pages) with every quote of the clicked cell/chip highlighted.
import { useEffect } from "react";
import PdfPane, { type PaneHighlight } from "./PdfPane";

export interface ViewerTarget {
  url: string;
  title: string;
  highlights: PaneHighlight[];
}

export default function PdfViewer({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[860px] flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Source document viewer"
        data-testid="pdf-drawer"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{target.title}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {target.highlights.length} highlighted passage{target.highlights.length === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" aria-label="Close viewer">
            ✕
          </button>
        </header>
        <div className="max-h-24 space-y-1 overflow-auto border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs leading-relaxed text-amber-900">
          {target.highlights.map((h) => (
            <div key={h.id}>
              <span className="font-semibold">p.{h.page}: </span>
              {h.text}
            </div>
          ))}
        </div>
        <PdfPane url={target.url} highlights={target.highlights} activeId={target.highlights[0]?.id} className="flex-1" />
      </aside>
    </>
  );
}
