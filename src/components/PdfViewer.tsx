"use client";
// Right-side drawer that renders a source PDF at the quoted page and highlights the quoted passage.
// The worker must be configured in the same module that renders <Document>/<Page> (react-pdf v11).
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

// react-pdf bundles its own pdfjs-dist (6.3.x) which differs from the top-level install, so the matching
// worker is copied to /public (public/pdf.worker.min.mjs) rather than resolved through import.meta.url.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface ViewerTarget {
  url: string;
  title: string;
  page: number;
  quote: string;
}

import { matchQuote, type Range } from "@/lib/highlight";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function PdfViewer({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const numPages = pdf?.numPages ?? 0;
  const [page, setPage] = useState(1);
  const [ranges, setRanges] = useState<Map<number, Range> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const url = target?.url;

  // Reset when a new target opens (state derived from props, adjusted during render).
  const key = target ? `${target.url}|${target.page}|${target.quote}` : "";
  const [lastKey, setLastKey] = useState("");
  const [lastUrl, setLastUrl] = useState<string | undefined>(undefined);
  if (url !== lastUrl) {
    setLastUrl(url);
    setPdf(null);
  }
  if (key !== lastKey) {
    setLastKey(key);
    setPage(target?.page ?? 1);
    setRanges(null);
    setError(null);
    setZoom(1);
  }

  // Compute the highlight ranges for the visible page from the PDF's own text items.
  useEffect(() => {
    if (!target || !pdf) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const tc = await p.getTextContent();
      const items = tc.items.map((i) => ("str" in i ? (i.str as string) : ""));
      if (cancelled) return;
      // Dense pages (e.g. long official tables) open zoomed in so the highlight is readable on screen.
      if (page === target.page && items.length > 150) setZoom(1.8);
      setRanges(page === target.page ? matchQuote(items, target.quote) : new Map());
    })().catch(() => {
      if (!cancelled) setRanges(new Map());
    });
    return () => {
      cancelled = true;
    };
  }, [target, page, pdf]);

  // Scroll first highlight into view once the text layer has rendered it.
  useEffect(() => {
    if (!ranges || ranges.size === 0) return;
    const t = setTimeout(() => {
      bodyRef.current?.querySelector("mark")?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 350);
    return () => clearTimeout(t);
  }, [ranges, page, zoom]);

  const customTextRenderer = useMemo(() => {
    return ({ str, itemIndex }: { str: string; itemIndex: number }) => {
      const r = ranges?.get(itemIndex);
      if (!r) return esc(str);
      return `${esc(str.slice(0, r[0]))}<mark data-hl="1">${esc(str.slice(r[0], r[1]))}</mark>${esc(str.slice(r[1]))}`;
    };
  }, [ranges]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  const notFound = ranges !== null && ranges.size === 0 && page === target.page;

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
              Page {page} of {numPages || "..."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-2 flex items-center overflow-hidden rounded-md border border-slate-200 text-xs text-slate-600">
              <button className="px-2 py-1 hover:bg-slate-50 disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.4))} aria-label="Zoom out">−</button>
              <span className="w-12 border-x border-slate-200 py-1 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button className="px-2 py-1 hover:bg-slate-50 disabled:opacity-40" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.4))} aria-label="Zoom in">+</button>
            </div>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={page >= numPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              aria-label="Close viewer"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs leading-relaxed text-amber-900">
          <span className="font-semibold">Quoted passage: </span>
          {target.quote}
          {notFound && <span className="ml-1 font-semibold">(could not be located in this page&apos;s text layer)</span>}
        </div>
        <div ref={bodyRef} className="flex-1 overflow-auto bg-slate-100 p-4">
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <Document
            key={url}
            file={url}
            onLoadSuccess={(doc) => {
              setPdf(doc);
            }}
            onLoadError={(e) => setError(`Could not load PDF: ${e.message}`)}
            loading={<div className="p-6 text-sm text-slate-500">Loading document...</div>}
          >
            {ranges && (
              <Page
                key={`${page}-${ranges.size}`}
                pageNumber={page}
                width={800 * zoom}
                customTextRenderer={customTextRenderer}
                renderAnnotationLayer={false}
                className="mx-auto w-fit shadow-md"
              />
            )}
          </Document>
        </div>
      </aside>
    </>
  );
}
