"use client";
// Reusable PDF pane: renders every page stacked and paints any number of quote highlights at once.
// The worker must be configured in the same module that renders <Document>/<Page> (react-pdf v11).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { matchQuotes, type ItemMark } from "@/lib/highlight";

// react-pdf bundles its own pdfjs-dist (6.3.x) which differs from the top-level install, so the matching
// worker is copied to /public (public/pdf.worker.min.mjs) rather than resolved through import.meta.url.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface PaneHighlight {
  page: number; // 1-indexed
  text: string;
  id: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function PdfPane({
  url,
  highlights,
  activeId,
  className = "",
}: {
  url: string;
  highlights: PaneHighlight[];
  activeId?: string | null;
  className?: string;
}) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [marks, setMarks] = useState<Map<number, Map<number, ItemMark[]>> | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(0); // bumps whenever a text layer finishes rendering
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef("");

  // Reset when the document changes (state derived from props, adjusted during render).
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    setPdf(null);
    setMarks(null);
    setError(null);
    setZoom(1);
  }

  // Measure the available width so pages fill the pane.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, el.clientWidth - 32));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const hlKey = useMemo(() => highlights.map((h) => `${h.id}@${h.page}:${h.text}`).join("|"), [highlights]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHighlights = useMemo(() => highlights, [hlKey]);

  // Locate every highlight on its page using the PDF's own text items.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const byPage = new Map<number, PaneHighlight[]>();
      for (const h of stableHighlights) byPage.set(h.page, [...(byPage.get(h.page) ?? []), h]);
      const result = new Map<number, Map<number, ItemMark[]>>();
      let dense = false;
      for (const [pageNo, list] of byPage) {
        if (pageNo < 1 || pageNo > pdf.numPages) continue;
        const tc = await (await pdf.getPage(pageNo)).getTextContent();
        const items = tc.items.map((i) => ("str" in i ? (i.str as string) : ""));
        if (items.length > 150) dense = true;
        result.set(pageNo, matchQuotes(items, list.map((h) => ({ id: h.id, text: h.text }))));
      }
      if (cancelled) return;
      // Dense pages (e.g. long official tables) open zoomed in so the highlight is readable on screen.
      if (dense) setZoom(1.8);
      setMarks(result);
    })().catch(() => {
      if (!cancelled) setMarks(new Map());
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, stableHighlights]);

  const pageNumbers = useMemo(() => Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => i + 1), [pdf]);

  // Renderer functions must keep a stable identity per page, or react-pdf re-renders the text layer in a loop.
  const renderers = useMemo(() => {
    const out = new Map<number, (t: { str: string; itemIndex: number }) => string>();
    for (const n of pageNumbers) {
      out.set(n, ({ str, itemIndex }) => {
        const list = marks?.get(n)?.get(itemIndex);
        if (!list || list.length === 0) return esc(str);
        let html = "";
        let pos = 0;
        for (const m of list) {
          html += esc(str.slice(pos, m.range[0]));
          html += `<mark data-hl-ids="${esc(m.ids.join(" "))}">${esc(str.slice(m.range[0], m.range[1]))}</mark>`;
          pos = m.range[1];
        }
        return html + esc(str.slice(pos));
      });
    }
    return out;
  }, [marks, pageNumbers]);
  const onTextLayer = useCallback(() => setRendered((r) => r + 1), []);

  // Emphasize the active highlight and scroll it into view (once per target).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !marks) return;
    body.querySelectorAll<HTMLElement>("mark[data-hl-ids]").forEach((m) => m.classList.toggle("hl-active", !!activeId && (m.dataset.hlIds ?? "").split(" ").includes(activeId)));
    const first = activeId ? body.querySelector<HTMLElement>(`mark[data-hl-ids~="${CSS.escape(activeId)}"]`) : null;
    const key = `${url}|${activeId}|${hlKey}|${zoom}`;
    if (first && scrolledFor.current !== key) {
      scrolledFor.current = key;
      const t = setTimeout(() => {
        const b = bodyRef.current;
        if (!b) return;
        const mr = first.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        b.scrollTo({ top: b.scrollTop + (mr.top - br.top) - b.clientHeight / 2 + mr.height / 2, behavior: "smooth" });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [activeId, marks, rendered, url, hlKey, zoom]);

  const pageWidth = Math.max(280, width) * zoom;

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
        <span>{pdf ? `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}` : "Loading..."}</span>
        <div className="flex items-center overflow-hidden rounded-md border border-slate-200 text-slate-600">
          <button className="px-2 py-1 hover:bg-slate-50 disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.4).toFixed(1)))} aria-label="Zoom out">
            −
          </button>
          <span className="w-12 border-x border-slate-200 py-1 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-1 hover:bg-slate-50 disabled:opacity-40" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.4).toFixed(1)))} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4" data-testid="pdf-pane-body">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <Document
          key={url}
          file={url}
          onLoadSuccess={(doc) => setPdf(doc)}
          onLoadError={(e) => setError(`Could not load PDF: ${e.message}`)}
          loading={<div className="p-6 text-sm text-slate-500">Loading document...</div>}
        >
          {marks &&
            pageNumbers.map((n) => (
              <div key={`${n}-${Math.round(pageWidth)}`} data-page={n} className="mx-auto mb-4 w-fit">
                <Page
                  pageNumber={n}
                  width={pageWidth}
                  customTextRenderer={renderers.get(n)}
                  renderAnnotationLayer={false}
                  onRenderTextLayerSuccess={onTextLayer}
                  className="shadow-md"
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
}
