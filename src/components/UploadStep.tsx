"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { activePlaybook, replayOnly } from "@/lib/activePlaybook";
import { dealNameOf } from "@/lib/meta";
import { DEMO_HASHES, replayFixture, sha256Hex } from "@/lib/runner";
import { PrimaryButton, Spinner, cx } from "./ui";

// What this page says about the bundled demo deal is read from its recorded run, not written in.
const demoRoom = replayFixture.docs.filter((d) => d.role !== "anchor");
// scripts/excerpt-real-docs.ts names the excerpts of real public documents *_excerpt.pdf; the rest are synthetic.
const demoExcerpts = demoRoom.filter((d) => /_excerpt\.pdf$/i.test(d.filename)).length;
const demoSynthetic = demoRoom.length - demoExcerpts;
const DEMO = {
  name: dealNameOf(replayFixture.baseline, "The demo deal"),
  room: `${demoSynthetic} synthetic document${demoSynthetic === 1 ? "" : "s"}`,
  excerpts: demoExcerpts > 0 ? ` plus ${demoExcerpts} excerpt${demoExcerpts === 1 ? "" : "s"} of real public IRS and county documents` : "",
  // What the recorded live run took; minutes only when the recording kept its duration.
  liveCost: [
    replayFixture.durationSec ? `about ${Math.max(1, Math.round(replayFixture.durationSec / 60))} min` : null,
    `about $${replayFixture.usage.costUsd.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(", "),
};

export interface PickedFile {
  key: string;
  file: File;
  hash?: string;
}
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

// The upload route's checks (src/app/api/upload/route.ts), applied as files are added so a file it would refuse is
// named now rather than after uploading.
const MAX_FILES = 30; // term sheet included
const MAX_MB = 20;
const refusal = (f: File) =>
  !f.name.toLowerCase().endsWith(".pdf") ? `${f.name} (not a .pdf file)` : f.size > MAX_MB * 1024 * 1024 ? `${f.name} (over ${MAX_MB} MB)` : null;

function DropZone({
  title,
  hint,
  multiple,
  files,
  onAdd,
  onRemove,
  testId,
}: {
  title: string;
  hint: string;
  multiple: boolean;
  files: PickedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  testId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    if (list?.length) onAdd(Array.from(list));
  };
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {files.length > 0 && (
          <span className="text-xs font-medium text-slate-500">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cx(
          "flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
          over ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white/70 hover:border-slate-400 hover:bg-white",
        )}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
          <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
        </svg>
        <div className="mt-2 text-sm font-medium text-slate-700">Drop {multiple ? "PDFs" : "a PDF"} here or click to browse</div>
        <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple={multiple}
          className="hidden"
          data-testid={testId}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 max-h-60 space-y-1.5 overflow-auto pr-1">
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">PDF</span>
              <span className="min-w-0 flex-1 truncate text-slate-800">{f.file.name}</span>
              <span className="shrink-0 text-xs text-slate-400">{Math.max(1, Math.round(f.file.size / 1024))} KB</span>
              <button onClick={() => onRemove(f.key)} className="shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${f.file.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UploadStep({
  busy,
  onReplay,
  onLiveDemo,
  onLiveUpload,
}: {
  busy: string | null;
  onReplay: () => void;
  onLiveDemo: () => void;
  onLiveUpload: (termSheet: File, dataRoom: File[]) => void;
}) {
  const [term, setTerm] = useState<PickedFile[]>([]);
  const [room, setRoom] = useState<PickedFile[]>([]);

  // Hash each dropped file in the browser so the bundled demo deal can be recognised. A key is held only while its
  // hash is in flight, so a file that is removed and added again is hashed again.
  const hashing = useRef(new Set<string>());
  useEffect(() => {
    for (const pf of [...term, ...room]) {
      if (pf.hash || hashing.current.has(pf.key)) continue;
      hashing.current.add(pf.key);
      sha256Hex(pf.file)
        .then((h) => {
          hashing.current.delete(pf.key);
          const set = (l: PickedFile[]) => l.map((x) => (x.key === pf.key ? { ...x, hash: h } : x));
          setTerm(set);
          setRoom(set);
        })
        .catch(() => hashing.current.delete(pf.key));
    }
  }, [term, room]);

  // Files the upload would refuse are named in a notice instead of being added.
  const [notice, setNotice] = useState<string | null>(null);
  const screen = (files: File[]) => {
    const refused = files.map(refusal).filter((r): r is string => r !== null);
    return { ok: files.filter((f) => !refusal(f)), refused };
  };
  const report = (refused: string[]) => setNotice(refused.length ? `Not added: ${refused.join("; ")}.` : null);
  const addTerm = (files: File[]) => {
    const { ok, refused } = screen(files);
    report(refused);
    if (!ok.length) return;
    setTerm([{ key: keyOf(ok[0]), file: ok[0] }]);
  };
  const addRoom = (files: File[]) => {
    const { ok, refused } = screen(files);
    const have = new Set(room.map((r) => r.key));
    const fresh = ok.filter((f) => !have.has(keyOf(f)));
    const added = fresh.slice(0, Math.max(0, MAX_FILES - 1 - room.length)); // one place is the term sheet's
    const over = fresh.length - added.length;
    if (over > 0) refused.push(`${over} more file${over === 1 ? "" : "s"} (at most ${MAX_FILES} per upload, term sheet included)`);
    report(refused);
    if (!added.length) return;
    setRoom([...room, ...added.map((file) => ({ key: keyOf(file), file }))]);
  };

  const ready = term.length === 1 && room.length > 0;
  const hashed = ready && [...term, ...room].every((f) => f.hash);
  const hashes = new Set([...term, ...room].map((f) => f.hash));
  const isDemo = hashed && hashes.size === DEMO_HASHES.size && [...DEMO_HASHES].every((h) => hashes.has(h));
  const liveButton = "rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50";
  const spinner = busy ? <Spinner className="border-slate-500 border-t-white" /> : null;

  return (
    <div className="mx-auto max-w-4xl pt-6 sm:pt-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{activePlaybook.name}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">Does the data room support the term sheet?</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
        Crosscheck reads the buyer&apos;s term sheet, scans the seller&apos;s data room, and tests each assumption behind the credit amount against
        verbatim, clickable evidence. Where documents disagree, it asks you to decide.
      </p>

      {/* The demo is the first action on the page: one click starts the recorded run. */}
      <div className="mt-10 rounded-xl border border-slate-300 bg-white p-6 shadow-sm" data-testid="demo-start">
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={onReplay} disabled={!!busy} className="px-6 py-3 text-base">
            {spinner}
            Start the interactive demo
          </PrimaryButton>
          {!replayOnly && (
            <button onClick={onLiveDemo} disabled={!!busy} className={liveButton}>
              Run the demo deal live with Claude ({DEMO.liveCost})
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600" data-testid="demo-description">
          {DEMO.name}: a term sheet and a data room of {DEMO.room}
          {DEMO.excerpts}. The demo replays a recorded live run, so there is nothing to upload and no sign-in; you still confirm the
          baseline, read the evidence and choose what to ask the seller.
        </p>
        <Link href="/reliability" className="mt-3 inline-block text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-600">
          How do we know when it&apos;s wrong? A real failure, how it was caught, and what changes when the evidence does →
        </Link>
      </div>
      {busy && <p className="mt-4 text-sm text-slate-600">{busy}</p>}

      <div className="mt-10 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-semibold text-slate-900">Or analyze your own documents</h2>
        {replayOnly ? (
          <p className="mt-1 text-sm text-slate-500">
            This public deployment only replays the recorded run. To analyze your own term sheet and data room, run Crosscheck locally
            with your own API key (see the README).
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Live analysis with Claude runs on your own documents (a few minutes). The bundled demo deal is recognised if you drop its files.
            </p>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <DropZone title="1 · Term sheet" hint={`One PDF, up to ${MAX_MB} MB`} multiple={false} files={term} onAdd={addTerm} onRemove={(k) => setTerm((l) => l.filter((x) => x.key !== k))} testId="term-input" />
              <DropZone title="2 · Data room" hint={`Up to ${MAX_FILES - 1} PDFs, ${MAX_MB} MB each`} multiple files={room} onAdd={addRoom} onRemove={(k) => setRoom((l) => l.filter((x) => x.key !== k))} testId="room-input" />
            </div>
            {notice && (
              <p className="mt-3 text-sm text-amber-800" role="status" data-testid="upload-notice">
                {notice}
              </p>
            )}
            {isDemo ? (
              <div className="fade-in mt-6 rounded-xl border border-slate-300 bg-white p-5 shadow-sm" data-testid="demo-choice">
                <div className="text-sm font-semibold text-slate-900">These are the bundled demo deal&apos;s files. A recorded run is available.</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <PrimaryButton onClick={onReplay} disabled={!!busy}>
                    {spinner}
                    Replay recorded run
                  </PrimaryButton>
                  <button onClick={onLiveDemo} disabled={!!busy} className={liveButton}>
                    Run live with Claude ({DEMO.liveCost})
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                {ready && (
                  <PrimaryButton onClick={() => onLiveUpload(term[0].file, room.map((r) => r.file))} disabled={!!busy || !hashed} className="px-6 py-3 text-base">
                    {spinner}
                    Start diligence
                  </PrimaryButton>
                )}
                <p className="text-sm text-slate-500">
                  {ready
                    ? "These are your own documents, so live analysis with Claude will run (a few minutes)."
                    : "Add a term sheet and at least one data room document to begin."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
